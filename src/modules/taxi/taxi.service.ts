import { randomBytes } from "node:crypto";
import { Types, type QueryFilter } from "mongoose";
import { AppError } from "../../middleware/error-handler.js";
import { Driver } from "../drivers/driver.model.js";
import { createAdminNotification } from "../notifications/admin-notification.service.js";
import { createUserNotification } from "../notifications/user-notification.service.js";
import {
  sendAdminBookingChangedEmail,
  sendAdminNewTaxiBookingEmail,
  sendDriverTripCancelledEmail,
  sendDriverTripUpdatedEmail,
  sendPaymentReceiptEmail,
  sendTaxiConfirmationEmail,
  sendTaxiStatusEmail,
} from "../notifications/email.service.js";
import {
  evaluateCancellation,
  formatPayoutSummary,
  type GuestCancelBookingInput,
  type GuestRefundRequestInput,
} from "../bookings/cancellation.js";
import { notifyDriverOfAssignment } from "./driver-notify.js";
import { TaxiBooking, type TaxiBookingRecord } from "./taxi.model.js";
import {
  calculateFareFromSettings,
  getTaxiSettings,
  vehicleFareFromSettings,
} from "./taxi-settings.service.js";
import { fetchDrivingDistance } from "./google-routes.js";
import type {
  AdminCreateTaxiBookingInput,
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

async function resolveRouteDistance(input: {
  pickupLocation?: string;
  dropoffLocation?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
}) {
  const pickup = input.pickupLocation?.trim();
  const dropoff = input.dropoffLocation?.trim();
  if ((!pickup || pickup.length < 2) && (input.pickupLat == null || input.pickupLng == null)) {
    throw new AppError(400, "Enter a pickup location");
  }
  if ((!dropoff || dropoff.length < 2) && (input.dropoffLat == null || input.dropoffLng == null)) {
    throw new AppError(400, "Enter a drop-off location");
  }

  return fetchDrivingDistance(
    {
      address: pickup,
      lat: input.pickupLat,
      lng: input.pickupLng,
    },
    {
      address: dropoff,
      lat: input.dropoffLat,
      lng: input.dropoffLng,
    },
  );
}

export async function estimateFare(
  input: FareEstimateInput,
  vehicleCapacity?: number,
) {
  const settings = await getTaxiSettings();
  const route = await resolveRouteDistance(input);
  // Fare is by vehicle size. Without a selected van, use the smallest tier that fits the party.
  const capacity =
    vehicleCapacity != null && vehicleCapacity > 0
      ? vehicleCapacity
      : input.passengers <= 4
        ? 4
        : input.passengers <= 7
          ? 7
          : 10;
  const estimatedFare = calculateFareFromSettings(settings, route.distanceKm, capacity);
  const perKm = vehicleFareFromSettings(settings, capacity);
  return {
    distanceKm: route.distanceKm,
    durationMinutes: route.durationMinutes,
    estimatedFare,
    currency: "USD" as const,
    estimated: false as const,
    guestFare: perKm,
    perKmUsd: perKm,
    vehicleCapacity: capacity,
  };
}

export async function listPublicVehicles(input: PublicVehiclesQuery) {
  const settings = await getTaxiSettings();
  const passengers = input.passengers;

  let distanceKm: number | null = null;
  let durationMinutes: number | null = null;

  if (
    (input.pickupLocation && input.dropoffLocation) ||
    (input.pickupLat != null &&
      input.pickupLng != null &&
      input.dropoffLat != null &&
      input.dropoffLng != null)
  ) {
    try {
      const route = await resolveRouteDistance(input);
      distanceKm = route.distanceKm;
      durationMinutes = route.durationMinutes;
    } catch (error) {
      console.warn("[taxi] Vehicle list continuing without live distance", error);
    }
  }

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

  const vehicles = drivers
    .map((d) => {
      const capacity = Number(d.passengerCapacity ?? 4);
      const busy = busySet.has(d._id.toString());
      const fits = capacity >= passengers;
      const fare =
        distanceKm != null
          ? calculateFareFromSettings(settings, distanceKm, capacity)
          : settings.minimumFareUsd;
      return {
        id: d._id.toString(),
        name: d.name,
        vehicleLabel: d.vehicleLabel || `${capacity}-seater`,
        passengerCapacity: capacity,
        isAvailable: Boolean(d.isAvailable) && !busy,
        fitsParty: fits,
        fare,
        perKmUsd: vehicleFareFromSettings(settings, capacity),
        busyUntil: busyUntilByDriver.get(d._id.toString()) ?? null,
        bookedSlots: (slotsByDriver.get(d._id.toString()) ?? []).slice(0, 8),
      };
    })
    .filter((v) => v.fitsParty);

  const fromFare =
    vehicles.length > 0
      ? Math.min(...vehicles.map((v) => v.fare))
      : settings.minimumFareUsd;

  return {
    fare: fromFare,
    guestFare: vehicleFareFromSettings(settings, passengers <= 4 ? 4 : passengers <= 7 ? 7 : 10),
    passengers,
    distanceKm,
    durationMinutes,
    currency: "USD" as const,
    vehicles,
  };
}

export async function createTaxiBooking(
  input: CreateTaxiBookingInput | AdminCreateTaxiBookingInput,
  userId?: string,
  options?: { notifyGuest?: boolean; source?: "public" | "admin" },
) {
  const paymentStatus = input.paymentStatus ?? "unpaid";
  const paymentReference = input.paymentReference?.trim();
  if (options?.source !== "admin" && (paymentStatus !== "paid" || !paymentReference)) {
    throw new AppError(400, "Pay with PayPal before booking this taxi ride");
  }
  if (paymentStatus === "paid" && !paymentReference && options?.source !== "admin") {
    throw new AppError(400, "Pay with PayPal before booking this taxi ride");
  }

  const {
    driverId: requestedDriverId,
    paymentMethod,
    notifyGuest: _notifyGuest,
    status: requestedStatus,
    pickupLat: _pickupLat,
    pickupLng: _pickupLng,
    dropoffLat: _dropoffLat,
    dropoffLng: _dropoffLng,
    ...bookingFields
  } = input as CreateTaxiBookingInput & AdminCreateTaxiBookingInput;

  let vehicleCapacity: number | undefined;
  if (requestedDriverId) {
    const driver = await Driver.findOne({ _id: requestedDriverId, isActive: true }).lean();
    if (!driver) {
      throw new AppError(404, "Selected vehicle was not found");
    }
    if (Number(driver.passengerCapacity ?? 0) < input.passengers) {
      throw new AppError(400, "Selected vehicle is too small for this party");
    }
    vehicleCapacity = Number(driver.passengerCapacity ?? 4);
  }

  const estimate = await estimateFare(input, vehicleCapacity);
  const pickupDate = toUtcDate(input.pickupDate);

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
    paymentStatus,
    paymentReference:
      paymentStatus === "paid" ? paymentReference || "OFFLINE" : paymentReference,
    paymentMethod:
      paymentMethod?.trim() || (paymentStatus === "paid" ? (options?.source === "admin" ? "Offline" : "PayPal") : "Offline"),
    status: requestedStatus === "confirmed" ? "confirmed" : "pending",
    ...(requestedDriverId ? { driverId: requestedDriverId } : {}),
  });

  const pickupDateIso = String(booking.pickupDate).slice(0, 10);
  const flightMatch = booking.notes?.match(/Flight[:\s]+([A-Z0-9]+)/i);
  const flightNumber = flightMatch?.[1];
  const taxiId = String(booking._id);

  const notifyGuest = options?.notifyGuest !== false;
  const fromAdmin = options?.source === "admin";

  void Promise.allSettled([
    ...(notifyGuest
      ? [
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
            pending: booking.status === "pending",
          }),
        ]
      : []),
    ...(paymentStatus === "paid" && notifyGuest
      ? [
          sendPaymentReceiptEmail({
            to: booking.customerEmail,
            name: booking.customerName,
            bookingReference: booking.bookingReference,
            totalAmount: Number(booking.estimatedFare),
            paymentMethod: booking.paymentMethod || "PayPal",
            stayLabel: undefined,
            taxiAmount: Number(booking.estimatedFare),
          }),
        ]
      : []),
    ...(!fromAdmin
      ? [
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
            body: `${booking.customerName} · ${pickupDateIso} ${booking.pickupTime} · ${paymentStatus} · ${booking.pickupLocation} → ${booking.dropoffLocation}`,
            href: `/admin/taxi/${taxiId}`,
            entityId: taxiId,
          }),
        ]
      : []),
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

function parseHoursMinutes(time: string): { hours: number; minutes: number } {
  const [hoursRaw, minutesRaw] = normalizePickupTime(time).split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
}

function timeToMinutes(time: string): number {
  const { hours, minutes } = parseHoursMinutes(time);
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
  const { hours, minutes } = parseHoursMinutes(pickupTime);
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

export async function cancelUserTaxiBooking(
  userId: string,
  reference: string,
  input: GuestCancelBookingInput,
) {
  const booking = await TaxiBooking.findOne({
    userId,
    bookingReference: reference.trim().toUpperCase(),
  }).populate("driverId", "name email phone vehicleLabel");
  if (!booking) throw new AppError(404, "Taxi booking not found");

  const preview = evaluateCancellation({
    eventDate: booking.pickupDate,
    paymentStatus: booking.paymentStatus,
    amount: Number(booking.estimatedFare),
    status: booking.status,
    kind: "taxi",
  });

  if (!preview.allowed) {
    throw new AppError(
      409,
      booking.status === "cancelled"
        ? "This trip is already cancelled"
        : "This trip can no longer be cancelled",
    );
  }

  const driverDoc =
    booking.driverId && typeof booking.driverId === "object"
      ? (booking.driverId as { name?: string; email?: string })
      : null;

  booking.status = "cancelled";
  booking.cancelledAt = new Date();
  booking.cancelledBy = "guest";
  booking.cancellationReason = input.reason?.trim() || undefined;
  booking.refundPercent = preview.refundPercent;
  booking.refundAmount = preview.refundAmount;
  booking.refundStatus = preview.refundEligible ? "eligible" : "none";
  await booking.save();

  const pickupDateIso = String(booking.pickupDate).slice(0, 10);
  const refundNote = preview.refundEligible
    ? `You are eligible for a 50% refund of $${preview.refundAmount.toFixed(2)}. Open My Bookings and submit a refund request with your payout details. Our team will process it manually.`
    : "This cancellation is non-refundable under our 7-day policy.";

  await sendTaxiStatusEmail({
    to: booking.customerEmail,
    name: booking.customerName,
    bookingReference: booking.bookingReference,
    status: "cancelled",
    pickupDate: pickupDateIso,
    pickupTime: booking.pickupTime,
    refundNote,
  }).catch((error) => {
    console.error("[email] Failed to send guest taxi cancel email", error);
  });

  if (driverDoc?.email && driverDoc.name) {
    await sendDriverTripCancelledEmail({
      to: String(driverDoc.email),
      driverName: String(driverDoc.name),
      pickupDate: pickupDateIso,
      pickupTime: booking.pickupTime,
      pickupLocation: booking.pickupLocation,
      dropoffLocation: booking.dropoffLocation,
    }).catch((error) => {
      console.error("[email] Failed to send driver trip cancelled", error);
    });
  }

  await sendAdminBookingChangedEmail({
    bookingReference: booking.bookingReference,
    action: "cancelled",
    summary: `Taxi ${booking.serviceType} · ${pickupDateIso} ${booking.pickupTime} · Guest ${booking.customerName} · ${
      preview.refundEligible
        ? `eligible for 50% refund $${preview.refundAmount.toFixed(2)} (awaiting guest request)`
        : "no refund"
    }`,
    extra: [
      preview.refundEligible
        ? `Refund: 50% · $${preview.refundAmount.toFixed(2)} · guest can submit payout details`
        : "Refund: none",
      input.reason ? `Reason: ${input.reason}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    href: preview.refundEligible ? "/admin/refunds" : `/admin/taxi/${String(booking._id)}`,
  }).catch((error) => {
    console.error("[email] Failed to send admin taxi cancel alert", error);
  });

  await createAdminNotification({
    type: "taxi_booking",
    title: preview.refundEligible
      ? "Guest cancelled taxi — refund eligible"
      : "Guest cancelled taxi — no refund",
    body: `${booking.customerName} · ${booking.bookingReference} · ${pickupDateIso} ${booking.pickupTime}${
      preview.refundEligible ? ` · $${preview.refundAmount.toFixed(2)}` : ""
    }`,
    href: preview.refundEligible ? "/admin/refunds" : `/admin/taxi/${String(booking._id)}`,
    entityId: String(booking._id),
  }).catch((error) => {
    console.error("[notify] Failed to create admin taxi cancel notification", error);
  });

  if (booking.userId) {
    await createUserNotification({
      userId: String(booking.userId),
      type: "taxi",
      title: "Taxi booking cancelled",
      body: preview.refundEligible
        ? `Trip cancelled. Submit your refund request (50% · $${preview.refundAmount.toFixed(2)}) from My Bookings.`
        : "Trip cancelled. No refund applies.",
      href: "/my-bookings",
      entityId: String(booking._id),
    }).catch((error) => {
      console.error("[notify] Failed to create guest taxi cancel notification", error);
    });
  }

  return booking.toObject();
}

export async function submitTaxiRefundRequest(
  userId: string,
  reference: string,
  input: GuestRefundRequestInput,
) {
  const booking = await TaxiBooking.findOne({
    userId,
    bookingReference: reference.trim().toUpperCase(),
  });
  if (!booking) throw new AppError(404, "Taxi booking not found");
  if (booking.status !== "cancelled") {
    throw new AppError(409, "Cancel the trip before requesting a refund");
  }
  if (Number(booking.refundPercent) <= 0 || Number(booking.refundAmount) <= 0) {
    throw new AppError(400, "This cancellation is not eligible for a refund");
  }
  if (["requested", "reviewing", "processed"].includes(String(booking.refundStatus))) {
    throw new AppError(409, "A refund request is already in progress for this trip");
  }
  if (booking.refundStatus === "rejected") {
    throw new AppError(409, "This refund was rejected. Contact support if you need help.");
  }

  booking.refundPayout = input.payout;
  booking.refundStatus = "requested";
  booking.refundRequestedAt = new Date();
  booking.refundAdminNote = undefined;
  await booking.save();

  const payoutLine = formatPayoutSummary(input.payout);
  await sendAdminBookingChangedEmail({
    bookingReference: booking.bookingReference,
    action: "updated",
    summary: `Taxi refund request · $${Number(booking.refundAmount).toFixed(2)} · ${booking.customerName}`,
    extra: [`Payout: ${payoutLine}`, "Open Admin → Refunds to review and process."].join("\n"),
    href: "/admin/refunds",
  }).catch((error) => {
    console.error("[email] Failed to send admin taxi refund request alert", error);
  });

  await createAdminNotification({
    type: "refund_request",
    title: "New taxi refund request",
    body: `${booking.customerName} · ${booking.bookingReference} · $${Number(booking.refundAmount).toFixed(2)} · ${payoutLine}`,
    href: "/admin/refunds",
    entityId: String(booking._id),
  }).catch((error) => {
    console.error("[notify] Failed to create admin taxi refund notification", error);
  });

  if (booking.userId) {
    await createUserNotification({
      userId: String(booking.userId),
      type: "taxi",
      title: "Refund request submitted",
      body: `We received your request for $${Number(booking.refundAmount).toFixed(2)}. Admin will process it manually.`,
      href: "/my-bookings",
      entityId: String(booking._id),
    }).catch((error) => {
      console.error("[notify] Failed to create guest taxi refund notification", error);
    });
  }

  return booking.toObject();
}
