import { randomBytes } from "node:crypto";
import { Types, type QueryFilter } from "mongoose";
import { AppError } from "../../middleware/error-handler.js";
import { Driver } from "../drivers/driver.model.js";
import { createAdminNotification } from "../notifications/admin-notification.service.js";
import { createUserNotification } from "../notifications/user-notification.service.js";
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

export async function estimateFare(input: FareEstimateInput) {
  // Demo: never call Google Routes. Any typed/map location is accepted.
  return demoFareEstimate(await getTaxiSettings(), input.passengers);
}

export async function listPublicVehicles(input: PublicVehiclesQuery) {
  const settings = await getTaxiSettings();
  const passengers = input.passengers;
  const estimatedFare = Math.max(
    settings.minimumFareUsd,
    guestFareFromSettings(settings, passengers),
  );

  const busySlot =
    input.pickupDate && input.pickupTime
      ? await busyDriverIdsForSlot(toUtcDate(input.pickupDate), input.pickupTime)
      : { ids: [] as string[], untilByDriver: new Map<string, string>() };
  const busySet = new Set(busySlot.ids.map((id) => String(id)));
  const busyUntilByDriver = busySlot.untilByDriver;

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

  const slotsByDriver = new Map<string, Array<{ date: string; time: string; until: string }>>();
  for (const trip of upcoming) {
    const id = String(trip.driverId);
    const list = slotsByDriver.get(id) ?? [];
    list.push({
      date: new Date(trip.pickupDate).toISOString().slice(0, 10),
      time: trip.pickupTime,
      until: addMinutesToTime(trip.pickupTime, TAXI_SLOT_MINUTES),
    });
    slotsByDriver.set(id, list);
  }

  const guestFare = guestFareFromSettings(settings, passengers);

  return {
    fare: estimatedFare,
    guestFare,
    passengers,
    distanceKm: null,
    durationMinutes: null,
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
          busyUntil: busyUntilByDriver.get(d._id.toString()) ?? null,
          bookedSlots: (slotsByDriver.get(d._id.toString()) ?? []).slice(0, 8),
        };
      })
      .filter((v) => v.fitsParty),
  };
}

export async function createTaxiBooking(input: CreateTaxiBookingInput, userId?: string) {
  const estimate = await estimateFare(input);
  const pickupDate = toUtcDate(input.pickupDate);

  const { driverId: requestedDriverId, ...bookingFields } = input;

  if (requestedDriverId) {
    const busy = await busyDriverIdsForSlot(pickupDate, input.pickupTime);
    if (busy.ids.includes(requestedDriverId)) {
      throw new AppError(
        409,
        "This taxi is booked for the next 1 hour. Please choose a time after that window, or another vehicle.",
      );
    }
  }

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
    status: "pending",
    ...(requestedDriverId ? { driverId: requestedDriverId } : {}),
  });

  const pickupDateIso = String(booking.pickupDate).slice(0, 10);
  const flightMatch = booking.notes?.match(/Flight[:\s]+([A-Z0-9]+)/i);
  const flightNumber = flightMatch?.[1];
  const taxiId = String(booking._id);

  void Promise.allSettled([
    sendTaxiConfirmationEmail({
      to: booking.customerEmail,
      name: booking.customerName,
      bookingReference: booking.bookingReference,
      serviceType: booking.serviceType,
      pickupLocation: booking.pickupLocation,
      dropoffLocation: booking.dropoffLocation,
      pickupDate: pickupDateIso,
      pickupTime: booking.pickupTime,
      estimatedFare: Number(booking.estimatedFare),
      currency: "USD",
      passengers: Number(booking.passengers),
      flightNumber: flightNumber ?? undefined,
      driverName: null,
      driverPhone: null,
      vehicleLabel: null,
      pending: true,
    }),
    sendPaymentReceiptEmail({
      to: booking.customerEmail,
      name: booking.customerName,
      bookingReference: booking.bookingReference,
      totalAmount: Number(booking.estimatedFare),
      paymentMethod: "Card / demo checkout",
      stayLabel: undefined,
      taxiAmount: Number(booking.estimatedFare),
    }),
    sendAdminNewTaxiBookingEmail({
      bookingReference: booking.bookingReference,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      serviceType: booking.serviceType,
      pickupLocation: booking.pickupLocation,
      dropoffLocation: booking.dropoffLocation,
      pickupDate: pickupDateIso,
      pickupTime: booking.pickupTime,
      estimatedFare: Number(booking.estimatedFare),
      passengers: Number(booking.passengers),
      driverName: null,
      vehicleLabel: null,
    }),
    createAdminNotification({
      type: "taxi_booking",
      title: "New taxi booking — pending",
      body: `${booking.customerName} · ${pickupDateIso} ${booking.pickupTime} · ${booking.pickupLocation} → ${booking.dropoffLocation}`,
      href: `/admin/taxi/${taxiId}`,
      entityId: taxiId,
    }),
  ]).then((results) => {
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[taxi] Background notify failed", result.reason);
      }
    }
  });

  return { ...booking.toObject(), vehicleUpgraded: false };
}

const ACTIVE_TAXI_STATUSES = ["pending", "confirmed", "assigned", "en_route"] as const;

function notifyGuestTaxiUpdate(input: {
  userId?: string | null;
  email: string;
  name: string;
  bookingReference: string;
  status: string;
  pickupDate: string;
  pickupTime: string;
  driverName?: string | null;
  entityId?: string;
}) {
  const showDriver = Boolean(input.driverName) && input.status === "assigned";
  void sendTaxiStatusEmail({
    to: input.email,
    name: input.name,
    bookingReference: input.bookingReference,
    status: input.status,
    pickupDate: input.pickupDate,
    pickupTime: input.pickupTime,
    driverName: showDriver ? input.driverName : null,
  }).catch((error) => {
    console.error("[email] Failed to send taxi status email", error);
  });

  if (!input.userId) return;
  void createUserNotification({
    userId: String(input.userId),
    type: "taxi",
    title: showDriver ? "Driver assigned — booking confirmed" : "Your taxi booking is confirmed",
    body: showDriver
      ? `${input.driverName} is assigned for ${input.pickupDate} at ${input.pickupTime}.`
      : `Your ride on ${input.pickupDate} at ${input.pickupTime} is confirmed.`,
    href: "/my-bookings",
    entityId: input.entityId,
  }).catch((error) => {
    console.error("[notify] Failed to create guest taxi notification", error);
  });
}

function normalizePickupTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value.trim();
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

/** Each taxi booking occupies the vehicle for 1 hour from pickup. */
const TAXI_SLOT_MINUTES = 60;

function timeToMinutes(time: string): number {
  const [hours, minutes] = normalizePickupTime(time).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(total: number): string {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutesToTime(time: string, add: number): string {
  return minutesToTime(timeToMinutes(time) + add);
}

function slotStartMs(pickupDate: Date, pickupTime: string): number {
  const [hours, minutes] = normalizePickupTime(pickupTime).split(":").map(Number);
  const start = new Date(pickupDate);
  start.setUTCHours(hours, minutes, 0, 0);
  return start.getTime();
}

function taxiSlotsOverlap(
  dateA: Date,
  timeA: string,
  dateB: Date,
  timeB: string,
): boolean {
  const startA = slotStartMs(dateA, timeA);
  const startB = slotStartMs(dateB, timeB);
  const durationMs = TAXI_SLOT_MINUTES * 60 * 1000;
  return startA < startB + durationMs && startB < startA + durationMs;
}

/**
 * A driver is busy for 1 hour from pickup (e.g. 15:00 blocks until 16:00).
 * 16:00 and later that day stay bookable.
 */
export async function busyDriverIdsForSlot(pickupDate: Date, pickupTime?: string, exceptBookingId?: string) {
  const dayStart = new Date(pickupDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const rangeStart = new Date(dayStart);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
  const rangeEnd = new Date(dayStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  rangeEnd.setUTCHours(23, 59, 59, 999);
  const time = pickupTime ? normalizePickupTime(pickupTime) : "";

  const trips = await TaxiBooking.find({
    driverId: { $ne: null },
    status: { $in: [...ACTIVE_TAXI_STATUSES] },
    pickupDate: { $gte: rangeStart, $lte: rangeEnd },
    ...(exceptBookingId ? { _id: { $ne: exceptBookingId } } : {}),
  })
    .select("driverId pickupDate pickupTime")
    .lean();

  const busy = new Set<string>();
  const busyUntil = new Map<string, string>();
  for (const trip of trips) {
    if (!trip.driverId) continue;
    const id = String(trip.driverId);
    if (!time) {
      const sameDay =
        new Date(trip.pickupDate).toISOString().slice(0, 10) ===
        dayStart.toISOString().slice(0, 10);
      if (!sameDay) continue;
      busy.add(id);
      continue;
    }
    if (!taxiSlotsOverlap(pickupDate, time, trip.pickupDate, trip.pickupTime)) continue;
    busy.add(id);
    busyUntil.set(id, addMinutesToTime(trip.pickupTime, TAXI_SLOT_MINUTES));
  }
  return { ids: [...busy], untilByDriver: busyUntil };
}

function driverCapacity(driver: { passengerCapacity?: number | null }) {
  const n = Number(driver.passengerCapacity);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

async function findFreeDriver(
  pickupDate: Date,
  options?: { preferredId?: string; minCapacity?: number; pickupTime?: string },
) {
  const busySlot = await busyDriverIdsForSlot(pickupDate, options?.pickupTime);
  const busyIds = busySlot.ids;
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

    notifyGuestTaxiUpdate({
      userId: booking.userId ? String(booking.userId) : null,
      email: booking.customerEmail,
      name: booking.customerName,
      bookingReference: booking.bookingReference,
      status: nextStatus,
      pickupDate: String(booking.pickupDate).slice(0, 10),
      pickupTime: booking.pickupTime,
      driverName: nextStatus === "assigned" ? driverName : null,
      entityId: String(booking._id),
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
    } else if (driverDoc?.email && driverDoc.name && nextStatus === "en_route") {
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

  const busySlot = await busyDriverIdsForSlot(
    booking.pickupDate,
    booking.pickupTime,
    booking.id,
  );
  if (busySlot.ids.some((id) => String(id) === driverId)) {
    const until = busySlot.untilByDriver.get(driverId);
    throw new AppError(
      409,
      until
        ? `That taxi is booked until ${until}. Please pick a later time.`
        : "That taxi is booked for the next 1 hour.",
    );
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

  void notifyDriverOfAssignment({
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
  }).catch((error) => {
    console.error("[notify] Failed to alert assigned driver", error);
  });

  void sendTaxiStatusEmail({
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

  if (booking.userId) {
    void createUserNotification({
      userId: String(booking.userId),
      type: "taxi",
      title: "Driver assigned — booking confirmed",
      body: `${driver.name} is assigned for ${String(booking.pickupDate).slice(0, 10)} at ${booking.pickupTime}.`,
      href: "/my-bookings",
      entityId: String(booking._id),
    }).catch((error) => {
      console.error("[notify] Failed to create guest assignment notification", error);
    });
  }

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
