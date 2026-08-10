import { randomBytes } from "node:crypto";
import { Types, type QueryFilter } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import { Driver } from "../drivers/driver.model.js";
import {
  sendAdminNewTaxiBookingEmail,
  sendDriverTripCancelledEmail,
  sendPaymentReceiptEmail,
  sendTaxiConfirmationEmail,
  sendTaxiStatusEmail,
} from "../notifications/email.service.js";
import { notifyDriverOfAssignment } from "./driver-notify.js";
import { TaxiBooking, type TaxiBookingRecord } from "./taxi.model.js";
import {
  calculateFareFromSettings,
  getTaxiSettings,
  guestFareFromSettings,
} from "./taxi-settings.service.js";
import type {
  AdminTaxiListQuery,
  CreateTaxiBookingInput,
  FareEstimateInput,
} from "./taxi.validation.js";

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function generateReference(): string {
  return `MFZ-TAXI-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function ensureBarbados(address: string): string {
  return /barbados/i.test(address) ? address : `${address}, Barbados`;
}

export async function estimateFare(input: FareEstimateInput) {
  const settings = await getTaxiSettings();

  if (!env.GOOGLE_MAPS_API_KEY) {
    const distanceKm = 12;
    return {
      distanceKm,
      durationMinutes: 25,
      estimatedFare: calculateFareFromSettings(settings, distanceKm, input.passengers),
      currency: "USD" as const,
      estimated: true as const,
      guestFare: guestFareFromSettings(settings, input.passengers),
      perKmUsd: settings.perKmUsd,
    };
  }

  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { address: ensureBarbados(input.pickupLocation) },
        destination: { address: ensureBarbados(input.dropoffLocation) },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
      signal: AbortSignal.timeout(10_000),
    },
  ).catch((error: unknown) => {
    console.error("Google Routes request failed", error);
    throw new AppError(502, "The route service is temporarily unavailable");
  });

  if (!response.ok) {
    console.error("Google Routes error", response.status, await response.text());
    throw new AppError(502, "Unable to calculate a route for those locations");
  }

  const payload = (await response.json()) as {
    routes?: Array<{ distanceMeters?: number; duration?: string }>;
  };
  const route = payload.routes?.[0];
  if (!route?.distanceMeters) {
    throw new AppError(422, "No driving route was found between those locations");
  }

  const distanceKm = Math.round((route.distanceMeters / 1000) * 10) / 10;
  const durationSeconds = route.duration ? Number(route.duration.replace("s", "")) : undefined;

  return {
    distanceKm,
    durationMinutes:
      durationSeconds && Number.isFinite(durationSeconds)
        ? Math.round(durationSeconds / 60)
        : undefined,
    estimatedFare: calculateFareFromSettings(settings, distanceKm, input.passengers),
    currency: "USD" as const,
    guestFare: guestFareFromSettings(settings, input.passengers),
    perKmUsd: settings.perKmUsd,
  };
}

export async function createTaxiBooking(input: CreateTaxiBookingInput, userId?: string) {
  const estimate = await estimateFare(input);
  const pickupDate = toUtcDate(input.pickupDate);

  const booking = await TaxiBooking.create({
    ...input,
    userId,
    pickupDate,
    customerEmail: input.customerEmail.toLowerCase(),
    bookingReference: generateReference(),
    distanceKm: estimate.distanceKm,
    durationMinutes: estimate.durationMinutes,
    estimatedFare: estimate.estimatedFare,
  });

  const freeDriver = await findFreeDriver(pickupDate);
  if (freeDriver) {
    booking.driverId = freeDriver._id;
    booking.assignedAt = new Date();
    booking.status = "assigned";
    await booking.save();
    await notifyDriverOfAssignment({
      driver: {
        name: freeDriver.name,
        email: freeDriver.email,
        phone: freeDriver.phone,
      },
      booking: {
        bookingReference: booking.bookingReference,
        serviceType: booking.serviceType,
        pickupLocation: booking.pickupLocation,
        dropoffLocation: booking.dropoffLocation,
        pickupDate: booking.pickupDate,
        pickupTime: booking.pickupTime,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
      },
    });
  }

  const populated = await TaxiBooking.findById(booking.id)
    .populate("driverId", "name email phone vehicleLabel isAvailable")
    .lean();

  if (!populated) {
    throw new AppError(500, "Taxi booking could not be loaded after create");
  }

  const driverDoc =
    populated.driverId && typeof populated.driverId === "object"
      ? (populated.driverId as {
          name?: string;
          phone?: string;
          vehicleLabel?: string | null;
        })
      : null;

  const pickupDateIso = String(populated.pickupDate).slice(0, 10);
  const flightMatch = populated.notes?.match(/Flight[:\s]+([A-Z0-9]+)/i);
  const flightNumber = flightMatch?.[1];

  await sendTaxiConfirmationEmail({
    to: populated.customerEmail,
    name: populated.customerName,
    bookingReference: populated.bookingReference,
    serviceType: populated.serviceType,
    pickupLocation: populated.pickupLocation,
    dropoffLocation: populated.dropoffLocation,
    pickupDate: pickupDateIso,
    pickupTime: populated.pickupTime,
    estimatedFare: Number(populated.estimatedFare),
    currency: "USD",
    passengers: Number(populated.passengers),
    flightNumber: flightNumber ?? undefined,
    driverName: driverDoc?.name ?? null,
    driverPhone: driverDoc?.phone ?? null,
    vehicleLabel: driverDoc?.vehicleLabel ?? null,
  }).catch((error) => {
    console.error("[email] Failed to send taxi confirmation", error);
  });

  await sendPaymentReceiptEmail({
    to: populated.customerEmail,
    name: populated.customerName,
    bookingReference: populated.bookingReference,
    totalAmount: Number(populated.estimatedFare),
    paymentMethod: "Card / demo checkout",
    stayLabel: undefined,
    taxiAmount: Number(populated.estimatedFare),
  }).catch((error) => {
    console.error("[email] Failed to send taxi payment receipt", error);
  });

  await sendAdminNewTaxiBookingEmail({
    bookingReference: populated.bookingReference,
    customerName: populated.customerName,
    customerEmail: populated.customerEmail,
    customerPhone: populated.customerPhone,
    serviceType: populated.serviceType,
    pickupLocation: populated.pickupLocation,
    dropoffLocation: populated.dropoffLocation,
    pickupDate: pickupDateIso,
    pickupTime: populated.pickupTime,
    estimatedFare: Number(populated.estimatedFare),
    driverName: driverDoc?.name ?? null,
  }).catch((error) => {
    console.error("[email] Failed to send admin taxi alert", error);
  });

  return populated;
}

/**
 * A driver is free if they are active + available and have no overlapping
 * assigned/en_route trip on the same pickup day.
 */
async function findFreeDriver(pickupDate: Date) {
  const dayStart = new Date(pickupDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(pickupDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const busyIds = await TaxiBooking.distinct("driverId", {
    driverId: { $ne: null },
    status: { $in: ["assigned", "en_route"] },
    pickupDate: { $gte: dayStart, $lte: dayEnd },
  });

  return Driver.findOne({
    isActive: true,
    isAvailable: true,
    ...(busyIds.length ? { _id: { $nin: busyIds } } : {}),
  })
    .sort({ updatedAt: 1, createdAt: 1 })
    .lean();
}

/** After a driver frees up, auto-assign the oldest waiting trip. */
export async function autoAssignNextWaitingTrip(preferredDriverId?: string) {
  const waiting = await TaxiBooking.findOne({
    status: { $in: ["pending", "confirmed"] },
    $or: [{ driverId: null }, { driverId: { $exists: false } }],
  })
    .sort({ pickupDate: 1, pickupTime: 1, createdAt: 1 })
    .lean();

  if (!waiting) return null;

  if (preferredDriverId) {
    const preferred = await Driver.findOne({
      _id: preferredDriverId,
      isActive: true,
      isAvailable: true,
    }).lean();
    if (preferred) {
      const stillFree = await findFreeDriver(waiting.pickupDate);
      if (stillFree && stillFree._id.toString() === preferredDriverId) {
        return assignTaxiDriver(waiting._id.toString(), preferredDriverId);
      }
    }
  }

  const free = await findFreeDriver(waiting.pickupDate);
  if (!free) return null;
  return assignTaxiDriver(waiting._id.toString(), free._id.toString());
}

export async function getPublicTaxiBooking(reference: string, email: string) {
  const booking = await TaxiBooking.findOne({
    bookingReference: reference.toUpperCase(),
    customerEmail: email.toLowerCase(),
  })
    .populate("driverId", "name email phone vehicleLabel")
    .lean();
  if (!booking) throw new AppError(404, "Taxi booking not found");
  return booking;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listTaxiBookings(input: AdminTaxiListQuery) {
  const filter: QueryFilter<TaxiBookingRecord> = {};
  if (input.status) filter.status = input.status;
  if (input.fromDate) filter.pickupDate = { $gte: toUtcDate(input.fromDate) };
  if (input.toDate) filter.pickupDate = { $lte: toUtcDate(input.toDate) };

  if (input.search) {
    const search = new RegExp(escapeRegExp(input.search), "i");
    filter.$or = [
      { bookingReference: search },
      { customerName: search },
      { customerEmail: search },
      { pickupLocation: search },
      { dropoffLocation: search },
    ];
  }

  const skip = (input.page - 1) * input.limit;
  const [items, total] = await Promise.all([
    TaxiBooking.find(filter)
      .sort({ pickupDate: 1 })
      .skip(skip)
      .limit(input.limit)
      .populate("userId", "name email phone")
      .populate("driverId", "name email phone vehicleLabel isAvailable")
      .lean(),
    TaxiBooking.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit),
    },
  };
}

export async function getTaxiBookingForAdmin(id: string) {
  const booking = await TaxiBooking.findById(id)
    .populate("driverId", "name email phone vehicleLabel isAvailable")
    .lean();
  if (!booking) throw new AppError(404, "Taxi booking not found");
  return booking;
}

export type TaxiStatus =
  | "pending"
  | "confirmed"
  | "assigned"
  | "en_route"
  | "completed"
  | "cancelled";

export type DriverTaxiStatus = "en_route" | "completed" | "cancelled";

const STATUS_TRANSITIONS: Record<TaxiStatus, readonly TaxiStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["assigned", "cancelled"],
  assigned: ["en_route", "cancelled"],
  en_route: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function updateTaxiBookingStatus(id: string, nextStatus: TaxiStatus) {
  const booking = await TaxiBooking.findById(id).populate(
    "driverId",
    "name email phone vehicleLabel",
  );
  if (!booking) throw new AppError(404, "Taxi booking not found");

  const previousDriverId = booking.driverId
    ? String(
        typeof booking.driverId === "object" && booking.driverId !== null && "_id" in booking.driverId
          ? (booking.driverId as { _id: unknown })._id
          : booking.driverId,
      )
    : undefined;
  const previousStatus = booking.status;

  if (booking.status !== nextStatus) {
    const allowed = STATUS_TRANSITIONS[booking.status as TaxiStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new AppError(409, `Cannot change taxi booking from ${booking.status} to ${nextStatus}`);
    }
    if (nextStatus === "assigned" && !booking.driverId) {
      throw new AppError(400, "Assign a driver before marking the trip as assigned");
    }
    booking.status = nextStatus;
    await booking.save();
  }

  if (
    previousStatus !== nextStatus &&
    (nextStatus === "cancelled" ||
      nextStatus === "confirmed" ||
      nextStatus === "assigned" ||
      nextStatus === "en_route" ||
      nextStatus === "completed")
  ) {
    const driverDoc =
      booking.driverId && typeof booking.driverId === "object"
        ? (booking.driverId as { name?: string; email?: string })
        : null;
    const driverName = driverDoc?.name ? String(driverDoc.name) : null;

    await sendTaxiStatusEmail({
      to: booking.customerEmail,
      name: booking.customerName,
      bookingReference: booking.bookingReference,
      status: nextStatus,
      pickupDate: String(booking.pickupDate).slice(0, 10),
      pickupTime: booking.pickupTime,
      driverName: driverName || null,
    }).catch((error) => {
      console.error("[email] Failed to send taxi status email", error);
    });

    if (nextStatus === "cancelled" && driverDoc?.email && driverDoc.name) {
      await sendDriverTripCancelledEmail({
        to: String(driverDoc.email),
        driverName: String(driverDoc.name),
        pickupDate: String(booking.pickupDate).slice(0, 10),
        pickupTime: booking.pickupTime,
        pickupLocation: booking.pickupLocation,
        dropoffLocation: booking.dropoffLocation,
      }).catch((error) => {
        console.error("[email] Failed to send driver trip cancelled", error);
      });
    }
  }

  // When a trip ends, try to auto-book the next waiting request for a free driver.
  if (
    (nextStatus === "completed" || nextStatus === "cancelled") &&
    previousDriverId
  ) {
    await autoAssignNextWaitingTrip(previousDriverId).catch(() => undefined);
  }

  return booking;
}

export async function assignTaxiDriver(bookingId: string, driverId: string) {
  const booking = await TaxiBooking.findById(bookingId);
  if (!booking) throw new AppError(404, "Taxi booking not found");

  if (booking.status === "completed" || booking.status === "cancelled") {
    throw new AppError(409, `Cannot assign a driver to a ${booking.status} trip`);
  }

  if (booking.status === "pending") {
    booking.status = "confirmed";
  }

  const driver = await Driver.findOne({ _id: driverId, isActive: true });
  if (!driver) throw new AppError(404, "Driver not found");
  if (!driver.isAvailable) {
    throw new AppError(409, "This driver is marked unavailable");
  }

  booking.driverId = new Types.ObjectId(driverId);
  booking.assignedAt = new Date();
  booking.status = "assigned";
  await booking.save();

  await notifyDriverOfAssignment({
    driver: {
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
    },
    booking: {
      bookingReference: booking.bookingReference,
      serviceType: booking.serviceType,
      pickupLocation: booking.pickupLocation,
      dropoffLocation: booking.dropoffLocation,
      pickupDate: booking.pickupDate,
      pickupTime: booking.pickupTime,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
    },
  });

  await sendTaxiStatusEmail({
    to: booking.customerEmail,
    name: booking.customerName,
    bookingReference: booking.bookingReference,
    status: "assigned",
    pickupDate: String(booking.pickupDate).slice(0, 10),
    pickupTime: booking.pickupTime,
    driverName: driver.name,
  }).catch((error) => {
    console.error("[email] Failed to send guest taxi assignment update", error);
  });

  return TaxiBooking.findById(booking.id)
    .populate("driverId", "name email phone vehicleLabel isAvailable")
    .lean();
}

export async function updateDriverTaxiStatus(
  bookingId: string,
  driverId: string,
  nextStatus: DriverTaxiStatus,
) {
  const booking = await TaxiBooking.findById(bookingId);
  if (!booking) throw new AppError(404, "Taxi booking not found");

  if (!booking.driverId || booking.driverId.toString() !== driverId) {
    throw new AppError(403, "This trip is not assigned to you");
  }

  return updateTaxiBookingStatus(bookingId, nextStatus);
}

export async function cancelTaxiBooking(id: string) {
  return updateTaxiBookingStatus(id, "cancelled");
}
