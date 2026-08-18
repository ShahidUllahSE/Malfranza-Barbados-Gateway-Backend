import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { QueryFilter } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import { TaxiBooking } from "../taxi/taxi.model.js";
import { REGULATED_TAXI_FARES } from "../taxi/taxi-settings.service.js";
import { Driver } from "./driver.model.js";
import type {
  AdminDriverDetailQuery,
  AdminDriverListQuery,
  CreateDriverInput,
  DriverLoginInput,
  UpdateDriverInput,
} from "./driver.validation.js";

const jwtKey = new TextEncoder().encode(env.JWT_SECRET);
const dummyHashPromise = bcrypt.hash(randomUUID(), 12);

export type AuthenticatedDriver = {
  id: string;
  email: string;
  name: string;
  phone: string;
  vehicleLabel?: string;
  isAvailable: boolean;
  role: "driver";
};

function toDriverIdentity(driver: {
  id: string;
  email: string;
  name: string;
  phone: string;
  vehicleLabel?: string | null;
  isAvailable: boolean;
}): AuthenticatedDriver {
  return {
    id: driver.id,
    email: driver.email,
    name: driver.name,
    phone: driver.phone,
    vehicleLabel: driver.vehicleLabel ?? undefined,
    isAvailable: driver.isAvailable,
    role: "driver",
  };
}

async function issueDriverToken(driver: AuthenticatedDriver): Promise<string> {
  return new SignJWT({
    email: driver.email,
    role: "driver",
    name: driver.name,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(driver.id)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_EXPIRES_IN}s`)
    .sign(jwtKey);
}

function defaultPricePerKm(capacity: number): number {
  return capacity <= 7 ? REGULATED_TAXI_FARES.fareFor5to7 : REGULATED_TAXI_FARES.fareFor8to10;
}

function resolvedPricePerKm(driver: {
  pricePerKmUsd?: number | null;
  passengerCapacity?: number | null;
}): number {
  const own = Number(driver.pricePerKmUsd);
  if (Number.isFinite(own) && own > 0) return own;
  return defaultPricePerKm(Number(driver.passengerCapacity) || 4);
}

function toAdminDriver(driver: {
  _id: { toString(): string };
  name: string;
  email: string;
  phone: string;
  vehicleLabel?: string | null;
  passengerCapacity?: number | null;
  pricePerKmUsd?: number | null;
  isAvailable: boolean;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt?: Date;
}) {
  return {
    id: driver._id.toString(),
    name: driver.name,
    email: driver.email,
    phone: driver.phone,
    vehicleLabel: driver.vehicleLabel ?? null,
    passengerCapacity: Number(driver.passengerCapacity ?? 4),
    pricePerKmUsd: resolvedPricePerKm(driver),
    isAvailable: driver.isAvailable,
    isActive: driver.isActive,
    lastLoginAt: driver.lastLoginAt ?? null,
    createdAt: driver.createdAt,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export async function createDriver(input: CreateDriverInput) {
  try {
    const passwordHash = await bcrypt.hash(input.password, 12);
    const capacity = input.passengerCapacity ?? 4;
    const driver = await Driver.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      vehicleLabel: input.vehicleLabel,
      passengerCapacity: capacity,
      pricePerKmUsd: input.pricePerKmUsd ?? defaultPricePerKm(capacity),
      isAvailable: input.isAvailable ?? true,
      passwordHash,
    });
    return toDriverIdentity({
      id: driver.id,
      email: driver.email,
      name: driver.name,
      phone: driver.phone,
      vehicleLabel: driver.vehicleLabel,
      isAvailable: driver.isAvailable,
    });
  } catch (error: unknown) {
    if (isDuplicateKey(error)) throw new AppError(409, "A driver with this email already exists");
    throw error;
  }
}

export async function listDrivers(input: AdminDriverListQuery) {
  const filter: QueryFilter<Record<string, unknown>> = {};
  if (input.isActive !== undefined) filter.isActive = input.isActive;
  if (input.isAvailable !== undefined) filter.isAvailable = input.isAvailable;

  const notDeleted = {
    $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }],
  };

  if (input.search) {
    const search = new RegExp(escapeRegExp(input.search), "i");
    filter.$and = [
      notDeleted,
      { $or: [{ name: search }, { email: search }, { phone: search }, { vehicleLabel: search }] },
    ];
  } else {
    Object.assign(filter, notDeleted);
  }

  const skip = (input.page - 1) * input.limit;
  const [items, total] = await Promise.all([
    Driver.find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit).lean(),
    Driver.countDocuments(filter),
  ]);

  return {
    items: items.map(toAdminDriver),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit),
    },
  };
}

export async function updateDriver(id: string, input: UpdateDriverInput) {
  const driver = await Driver.findById(id).select("+passwordHash");
  if (!driver) throw new AppError(404, "Driver not found");

  if (input.name !== undefined) driver.name = input.name;
  if (input.phone !== undefined) driver.phone = input.phone;
  if (input.vehicleLabel !== undefined) driver.vehicleLabel = input.vehicleLabel ?? undefined;
  if (input.passengerCapacity !== undefined) driver.passengerCapacity = input.passengerCapacity;
  if (input.pricePerKmUsd !== undefined) driver.pricePerKmUsd = input.pricePerKmUsd;
  if (input.isAvailable !== undefined) driver.isAvailable = input.isAvailable;
  if (input.isActive !== undefined) driver.isActive = input.isActive;
  if (input.password) driver.passwordHash = await bcrypt.hash(input.password, 12);

  try {
    await driver.save();
  } catch (error: unknown) {
    if (isDuplicateKey(error)) throw new AppError(409, "A driver with this email already exists");
    throw error;
  }

  return toDriverIdentity({
    id: driver.id,
    email: driver.email,
    name: driver.name,
    phone: driver.phone,
    vehicleLabel: driver.vehicleLabel,
    isAvailable: driver.isAvailable,
  });
}

export async function deleteDriver(id: string) {
  const driver = await Driver.findById(id);
  if (!driver) throw new AppError(404, "Driver not found");

  const activeTrip = await TaxiBooking.exists({
    driverId: driver._id,
    status: { $in: ["assigned", "en_route"] },
  });
  if (activeTrip) {
    throw new AppError(
      409,
      "Cannot delete a driver with active trips. Reassign or complete those trips first, or deactivate the driver instead.",
    );
  }

  await Driver.findByIdAndDelete(id);
  return { id: driver.id };
}

export async function loginDriver(input: DriverLoginInput) {
  const driver = await Driver.findOne({ email: input.email }).select("+passwordHash");
  const passwordHash = driver?.passwordHash ?? (await dummyHashPromise);
  const validPassword = await bcrypt.compare(input.password, passwordHash);

  if (!driver || !validPassword || !driver.isActive || driver.deletedAt) {
    throw new AppError(401, "Invalid email or password");
  }

  driver.lastLoginAt = new Date();
  await driver.save();

  const identity = toDriverIdentity({
    id: driver.id,
    email: driver.email,
    name: driver.name,
    phone: driver.phone,
    vehicleLabel: driver.vehicleLabel,
    isAvailable: driver.isAvailable,
  });

  return { driver: identity, token: await issueDriverToken(identity) };
}

export async function verifyDriverToken(token: string): Promise<AuthenticatedDriver> {
  try {
    const { payload } = await jwtVerify(token, jwtKey, { algorithms: ["HS256"] });
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      payload.role !== "driver" ||
      typeof payload.name !== "string"
    ) {
      throw new Error("Invalid token claims");
    }

    const driver = await Driver.findOne({ _id: payload.sub, isActive: true }).lean();
    if (!driver) throw new Error("Driver no longer active");

    return toDriverIdentity({
      id: driver._id.toString(),
      email: driver.email,
      name: driver.name,
      phone: driver.phone,
      vehicleLabel: driver.vehicleLabel,
      isAvailable: driver.isAvailable,
    });
  } catch {
    throw new AppError(401, "Invalid or expired access token");
  }
}

export async function setDriverAvailability(driverId: string, isAvailable: boolean) {
  const driver = await Driver.findOneAndUpdate(
    { _id: driverId, isActive: true },
    { isAvailable },
    { new: true },
  );
  if (!driver) throw new AppError(404, "Driver not found");

  return toDriverIdentity({
    id: driver.id,
    email: driver.email,
    name: driver.name,
    phone: driver.phone,
    vehicleLabel: driver.vehicleLabel,
    isAvailable: driver.isAvailable,
  });
}

export async function listDriverTrips(driverId: string) {
  return TaxiBooking.find({
    driverId,
    status: { $in: ["assigned", "en_route", "completed"] },
  })
    .sort({ pickupDate: 1, pickupTime: 1 })
    .limit(100)
    .lean();
}

function parseDateOnlyStart(value: string): Date {
  const parts = value.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function parseDateOnlyEnd(value: string): Date {
  const parts = value.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

function toDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolvePickupDateRange(query: AdminDriverDetailQuery): { from?: Date; to?: Date } {
  if (query.fromDate || query.toDate) {
    return {
      from: query.fromDate ? parseDateOnlyStart(query.fromDate) : undefined,
      to: query.toDate ? parseDateOnlyEnd(query.toDate) : undefined,
    };
  }

  const today = toDateOnlyUtc(new Date());
  const todayStart = parseDateOnlyStart(today);

  if (query.day === "today") {
    return { from: todayStart, to: parseDateOnlyEnd(today) };
  }

  if (query.day === "yesterday") {
    const y = new Date(todayStart);
    y.setUTCDate(y.getUTCDate() - 1);
    const key = toDateOnlyUtc(y);
    return { from: parseDateOnlyStart(key), to: parseDateOnlyEnd(key) };
  }

  if (query.day === "week") {
    const from = new Date(todayStart);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from, to: parseDateOnlyEnd(today) };
  }

  if (query.day === "month") {
    const from = new Date(todayStart);
    from.setUTCDate(from.getUTCDate() - 29);
    return { from, to: parseDateOnlyEnd(today) };
  }

  return {};
}

function mapAdminTrip(booking: {
  _id: { toString(): string };
  bookingReference: string;
  serviceType: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDate: Date;
  pickupTime: string;
  passengers: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes?: string | null;
  distanceKm: number;
  durationMinutes?: number | null;
  estimatedFare: number;
  status: string;
  assignedAt?: Date | null;
  createdAt?: Date;
}) {
  return {
    id: booking._id.toString(),
    bookingReference: booking.bookingReference,
    serviceType: booking.serviceType,
    pickupLocation: booking.pickupLocation,
    dropoffLocation: booking.dropoffLocation,
    pickupDate: toDateOnlyUtc(new Date(booking.pickupDate)),
    pickupTime: booking.pickupTime,
    passengers: booking.passengers,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    notes: booking.notes ?? null,
    distanceKm: booking.distanceKm,
    durationMinutes: booking.durationMinutes ?? null,
    estimatedFare: booking.estimatedFare,
    status: booking.status,
    assignedAt: booking.assignedAt ?? null,
    createdAt: booking.createdAt ?? null,
  };
}

export async function getAdminDriverDetail(id: string, query: AdminDriverDetailQuery) {
  const driver = await Driver.findById(id).lean();
  if (!driver) throw new AppError(404, "Driver not found");

  const allTrips = await TaxiBooking.find({ driverId: id }).lean();
  const todayKey = toDateOnlyUtc(new Date());
  const weekFrom = parseDateOnlyStart(todayKey);
  weekFrom.setUTCDate(weekFrom.getUTCDate() - 6);

  const stats = {
    total: allTrips.length,
    completed: allTrips.filter((t) => t.status === "completed").length,
    cancelled: allTrips.filter((t) => t.status === "cancelled").length,
    assigned: allTrips.filter((t) => t.status === "assigned").length,
    enRoute: allTrips.filter((t) => t.status === "en_route").length,
    completedToday: allTrips.filter(
      (t) => t.status === "completed" && toDateOnlyUtc(new Date(t.pickupDate)) === todayKey,
    ).length,
    completedThisWeek: allTrips.filter((t) => {
      if (t.status !== "completed") return false;
      const d = new Date(t.pickupDate);
      return d >= weekFrom && d <= parseDateOnlyEnd(todayKey);
    }).length,
    activeNow: allTrips.filter((t) => t.status === "assigned" || t.status === "en_route").length,
    fareEarned: allTrips
      .filter((t) => t.status === "completed")
      .reduce((sum, t) => sum + (t.estimatedFare || 0), 0),
  };

  const tripFilter: QueryFilter<Record<string, unknown>> = { driverId: id };
  if (query.status !== "all") tripFilter.status = query.status;

  const range = resolvePickupDateRange(query);
  if (range.from || range.to) {
    tripFilter.pickupDate = {
      ...(range.from ? { $gte: range.from } : {}),
      ...(range.to ? { $lte: range.to } : {}),
    };
  }

  const trips = await TaxiBooking.find(tripFilter)
    .sort({ pickupDate: -1, pickupTime: -1 })
    .limit(query.limit)
    .lean();

  return {
    driver: toAdminDriver(driver),
    stats,
    trips: trips.map(mapAdminTrip),
    filters: {
      status: query.status,
      day: query.day,
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
    },
  };
}

export async function listAvailableDrivers() {
  const items = await Driver.find({ isActive: true, isAvailable: true })
    .sort({ name: 1 })
    .lean();
  return items.map((d) => ({
    id: d._id.toString(),
    name: d.name,
    email: d.email,
    phone: d.phone,
    vehicleLabel: d.vehicleLabel ?? null,
    passengerCapacity: Number(d.passengerCapacity ?? 4),
    pricePerKmUsd: resolvedPricePerKm(d),
    isAvailable: d.isAvailable,
  }));
}
