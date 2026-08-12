import { randomBytes } from "node:crypto";
import { Types, type QueryFilter } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import { Driver } from "../drivers/driver.model.js";
import { createAdminNotification } from "../notifications/admin-notification.service.js";
import {
  sendAdminNewTaxiBookingEmail,
  sendDriverTripCancelledEmail,
  sendDriverTripUpdatedEmail,
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
  PublicVehiclesQuery,
} from "./taxi.validation.js";

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function generateReference(): string {
  return `MFZ-TAXI-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function demoFareEstimate(
  settings: Awaited<ReturnType<typeof getTaxiSettings>>,
  passengers: number,
) {
  const distanceKm = 12;
  return {
    distanceKm,
    durationMinutes: 25,
    estimatedFare: calculateFareFromSettings(settings, distanceKm, passengers),
    currency: "USD" as const,
    estimated: true as const,
    guestFare: guestFareFromSettings(settings, passengers),
    perKmUsd: settings.perKmUsd,
  };
}

async function requestGoogleRoute(origin: string, destination: string) {
  if (!env.GOOGLE_MAPS_API_KEY) return null;
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
        origin: { address: origin },
        destination: { address: destination },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
      signal: AbortSignal.timeout(10_000),
    },
  ).catch((error: unknown) => {
    console.warn("[taxi] Google Routes request failed — using demo fare", error);
    return null;
  });
  if (!response?.ok) {
    if (response) {
      console.warn("[taxi] Google Routes error", response.status, await response.text().catch(() => ""));
    }
    return null;
  }
  const payload = (await response.json()) as {
    routes?: Array<{ distanceMeters?: number; duration?: string }>;
  };
  return payload.routes?.[0] ?? null;
}

export async function estimateFare(input: FareEstimateInput) {
  const settings = await getTaxiSettings();
  try {
    const pickup = input.pickupLocation.trim();
    const dropoff = input.dropoffLocation.trim();

    // Never block a booking on Maps. Try the typed text as-is; demo fare if no route.
    const route = pickup && dropoff ? await requestGoogleRoute(pickup, dropoff) : null;

    if (!route?.distanceMeters) {
      return demoFareEstimate(settings, input.passengers);
    }

    const distanceKm = Math.round((route.distanceMeters / 1000) * 10) / 10;
    const durationSeconds = route.duration ? Number(route.duration.replace("s", "")) : undefined;

    return {
      distanceKm,
      durationMinutes:
        durationSeconds && Number.isFinite(durationSeconds)
          ? Math.round(durationSeconds / 60)
          : 25,
      estimatedFare: calculateFareFromSettings(settings, distanceKm, input.passengers),
      currency: "USD" as const,
      estimated: true as const,
      guestFare: guestFareFromSettings(settings, input.passengers),
      perKmUsd: settings.perKmUsd,
    };
  } catch (error) {
    console.warn("[taxi] Fare estimate fell back to demo rates", error);
    return demoFareEstimate(settings, input.passengers);
  }
}

export async function listPublicVehicles(input: PublicVehiclesQuery) {
  const settings = await getTaxiSettings();
  const passengers = input.passengers;
  let estimatedFare = guestFareFromSettings(settings, passengers);
  let distanceKm: number | undefined;
  let durationMinutes: number | undefined;

  if (input.pickupLocation && input.dropoffLocation) {
    try {
      const estimate = await estimateFare({
        pickupLocation: input.pickupLocation,
        dropoffLocation: input.dropoffLocation,
        passengers,
      });
      estimatedFare = estimate.estimatedFare;
      distanceKm = estimate.distanceKm;
      durationMinutes = estimate.durationMinutes;
    } catch {
      estimatedFare = calculateFareFromSettings(settings, 12, passengers);
    }
  } else {
    estimatedFare = Math.max(settings.minimumFareUsd, estimatedFare);
  }

  const busyIds =
    input.pickupDate && input.pickupTime
      ? await busyDriverIdsForSlot(toUtcDate(input.pickupDate), input.pickupTime)
      : [];
  const busySet = new Set(busyIds.map((id) => String(id)));

  const drivers = await Driver.find({ isActive: true })
    .sort({ passengerCapacity: 1, name: 1 })
    .lean();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const upcoming = await TaxiBooking.find({
    driverId: { $ne: null },
    status: { $in: ACTIVE_TAXI_STATUSES },
    pickupDate: { $gte: today },
  })
    .select("driverId pickupDate pickupTime")
    .sort({ pickupDate: 1, pickupTime: 1 })
    .lean();

  const slotsByDriver = new Map<string, Array<{ date: string; time: string }>>();
  for (const trip of upcoming) {
    const id = String(trip.driverId);
    const list = slotsByDriver.get(id) ?? [];
    list.push({
      date: new Date(trip.pickupDate).toISOString().slice(0, 10),
      time: trip.pickupTime,
    });
    slotsByDriver.set(id, list);
  }

  const guestFare = guestFareFromSettings(settings, passengers);

  return {
    fare: estimatedFare,
    guestFare,
    passengers,
    distanceKm: distanceKm ?? null,
    durationMinutes: durationMinutes ?? null,
    currency: "USD" as const,
    vehicles: drivers
      .map((d) => {
        const capacity = Number(d.passengerCapacity ?? 4);
        const busy = busySet.has(d._id.toString());
        const fits = capacity >= passengers;
        return {
          id: d._id.toString(),
          name: d.name,
          vehicleLabel: d.vehicleLabel || `${capacity}-seater`,
          passengerCapacity: capacity,
          isAvailable: Boolean(d.isAvailable) && !busy,
          fitsParty: fits,
          fare: estimatedFare,
          bookedSlots: (slotsByDriver.get(d._id.toString()) ?? []).slice(0, 8),
        };
      })
      .filter((v) => v.fitsParty),
  };
}

export async function createTaxiBooking(input: CreateTaxiBookingInput, userId?: string) {
  let estimate;
  try {
    estimate = await estimateFare(input);
  } catch (error) {
    console.warn("[taxi] Booking fare fell back to demo rates", error);
    estimate = demoFareEstimate(await getTaxiSettings(), input.passengers);
  }
  const pickupDate = toUtcDate(input.pickupDate);

  const { driverId: requestedDriverId, ...bookingFields } = input;

  const booking = await TaxiBooking.create({
    ...bookingFields,
    userId,
    pickupDate,
    pickupTime: normalizePickupTime(input.pickupTime),
    customerEmail: input.customerEmail.toLowerCase(),
    bookingReference: generateReference(),
    distanceKm: estimate.distanceKm,
    durationMinutes: estimate.durationMinutes,
    estimatedFare: estimate.estimatedFare,
  });

  const freeDriver = await findFreeDriver(pickupDate, {
    preferredId: requestedDriverId,
    minCapacity: input.passengers,
    pickupTime: input.pickupTime,
  });
  const vehicleUpgraded = Boolean(
    requestedDriverId && freeDriver && String(freeDriver._id) !== requestedDriverId,
  );

  if (!freeDriver && requestedDriverId) {
    await TaxiBooking.deleteOne({ _id: booking._id });
    throw new AppError(409, "No vehicle is free for this party size at that date and time.");
  }

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
        passengers: Number(booking.passengers),
        vehicleLabel: freeDriver.vehicleLabel ?? undefined,
      },
    });
  }

  const populated = await TaxiBooking.findById(booking.id)
    .populate("driverId", "name email phone vehicleLabel passengerCapacity isAvailable")
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
    passengers: Number(populated.passengers),
    driverName: driverDoc?.name ?? null,
    vehicleLabel: driverDoc?.vehicleLabel ?? null,
  }).catch((error) => {
    console.error("[email] Failed to send admin taxi alert", error);
  });

  const taxiId = String(populated._id);
  await createAdminNotification({
    type: "taxi_booking",
    title: "New taxi booking",
    body: `${populated.customerName} · ${pickupDateIso} ${populated.pickupTime} · ${populated.pickupLocation} → ${populated.dropoffLocation}`,
    href: `/admin/taxi/${taxiId}`,
    entityId: taxiId,
  }).catch((error) => {
    console.error("[notify] Failed to create admin taxi notification", error);
  });

  return { ...populated, vehicleUpgraded };
}

const ACTIVE_TAXI_STATUSES = ["pending", "confirmed", "assigned", "en_route"] as const;

function normalizePickupTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value.trim();
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

/**
 * A driver is busy only for the same pickup date and time.
 * Other times that day stay bookable.
 */
async function busyDriverIdsForSlot(pickupDate: Date, pickupTime?: string, exceptBookingId?: string) {
  const dayStart = new Date(pickupDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(pickupDate);
  dayEnd.setUTCHours(23, 59, 59, 999);
  const time = pickupTime ? normalizePickupTime(pickupTime) : "";

  const trips = await TaxiBooking.find({
    driverId: { $ne: null },
    status: { $in: [...ACTIVE_TAXI_STATUSES] },
    pickupDate: { $gte: dayStart, $lte: dayEnd },
    ...(exceptBookingId ? { _id: { $ne: exceptBookingId } } : {}),
  })
    .select("driverId pickupTime")
    .lean();

  const busy = new Set<string>();
  for (const trip of trips) {
    if (!trip.driverId) continue;
    if (time && normalizePickupTime(trip.pickupTime) !== time) continue;
    busy.add(String(trip.driverId));
  }
  return [...busy];
}

function driverCapacity(driver: { passengerCapacity?: number | null }) {
  const n = Number(driver.passengerCapacity);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

async function findFreeDriver(
  pickupDate: Date,
  options?: { preferredId?: string; minCapacity?: number; pickupTime?: string },
) {
  const busyIds = await busyDriverIdsForSlot(pickupDate, options?.pickupTime);
  const busySet = new Set(busyIds.map((id) => String(id)));
  const min = options?.minCapacity ?? 1;

  if (options?.preferredId && !busySet.has(options.preferredId)) {
    const driver = await Driver.findOne({
      _id: options.preferredId,
      isActive: { $ne: false },
    }).lean();
    if (driver && driver.isAvailable !== false && driverCapacity(driver) >= min) {
      return driver;
    }
  }

  const candidates = await Driver.find({
    isActive: { $ne: false },
    isAvailable: { $ne: false },
    ...(busyIds.length ? { _id: { $nin: busyIds } } : {}),
  })
    .sort({ passengerCapacity: 1, updatedAt: 1, createdAt: 1 })
    .lean();

  return candidates.find((driver) => driverCapacity(driver) >= min) ?? null;
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
      const stillFree = await findFreeDriver(waiting.pickupDate, {
        pickupTime: waiting.pickupTime,
      });
      if (stillFree && stillFree._id.toString() === preferredDriverId) {
        return assignTaxiDriver(waiting._id.toString(), preferredDriverId);
      }
    }
  }

  const free = await findFreeDriver(waiting.pickupDate, {
    minCapacity: waiting.passengers,
    pickupTime: waiting.pickupTime,
  });
  if (!free) return null;
  return assignTaxiDriver(waiting._id.toString(), free._id.toString());
}

export async function getPublicTaxiBooking(reference: string, email: string) {
  const booking = await TaxiBooking.findOne({
    bookingReference: reference.toUpperCase(),
    customerEmail: email.toLowerCase(),
  })
    .populate("driverId", "name email phone vehicleLabel passengerCapacity")
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
      .populate("driverId", "name email phone vehicleLabel passengerCapacity isAvailable")
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
    .populate("driverId", "name email phone vehicleLabel passengerCapacity isAvailable")
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
    } else if (
      driverDoc?.email &&
      driverDoc.name &&
      (nextStatus === "en_route" || nextStatus === "confirmed")
    ) {
      await sendDriverTripUpdatedEmail({
        to: String(driverDoc.email),
        driverName: String(driverDoc.name),
        summary: `Status is now ${nextStatus.replaceAll("_", " ")}`,
        pickupDate: String(booking.pickupDate).slice(0, 10),
        pickupTime: booking.pickupTime,
        pickupLocation: booking.pickupLocation,
        dropoffLocation: booking.dropoffLocation,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
      }).catch((error) => {
        console.error("[email] Failed to send driver trip updated", error);
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

  const busyIds = await busyDriverIdsForSlot(
    booking.pickupDate,
    booking.pickupTime,
    booking.id,
  );
  if (busyIds.some((id) => String(id) === driverId)) {
    throw new AppError(409, "That driver already has a trip at this date and time");
  }

  const previousDriverId = booking.driverId ? String(booking.driverId) : null;
  const previousDriver =
    previousDriverId && previousDriverId !== driverId
      ? await Driver.findById(previousDriverId).lean()
      : null;

  booking.driverId = new Types.ObjectId(driverId);
  booking.assignedAt = new Date();
  booking.status = "assigned";
  await booking.save();

  if (previousDriver?.email && previousDriver.name) {
    await sendDriverTripCancelledEmail({
      to: previousDriver.email,
      driverName: previousDriver.name,
      pickupDate: String(booking.pickupDate).slice(0, 10),
      pickupTime: booking.pickupTime,
      pickupLocation: booking.pickupLocation,
      dropoffLocation: booking.dropoffLocation,
    }).catch((error) => {
      console.error("[email] Failed to notify previous driver of reassignment", error);
    });
  }

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
      passengers: Number(booking.passengers),
      vehicleLabel: driver.vehicleLabel ?? undefined,
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
    .populate("driverId", "name email phone vehicleLabel passengerCapacity isAvailable")
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
