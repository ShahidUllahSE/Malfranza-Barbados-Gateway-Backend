import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import { Booking } from "../bookings/booking.model.js";
import { TaxiBooking } from "../taxi/taxi.model.js";
import { User } from "./user.model.js";
import type { LoginUserInput, RegisterUserInput } from "./user.validation.js";

const jwtKey = new TextEncoder().encode(env.JWT_SECRET);
const dummyHashPromise = bcrypt.hash(randomUUID(), 12);

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: "user";
};

async function issueUserToken(user: AuthenticatedUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_EXPIRES_IN}s`)
    .sign(jwtKey);
}

export async function registerUser(input: RegisterUserInput) {
  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    throw new AppError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    phone: input.phone,
  });

  const identity: AuthenticatedUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? undefined,
    role: "user",
  };

  return { user: identity, token: await issueUserToken(identity) };
}

export async function loginUser(input: LoginUserInput) {
  const user = await User.findOne({ email: input.email }).select("+passwordHash");
  const passwordHash = user?.passwordHash ?? (await dummyHashPromise);
  const validPassword = await bcrypt.compare(input.password, passwordHash);

  if (!user || !validPassword || !user.isActive) {
    throw new AppError(401, "Invalid email or password");
  }

  user.lastLoginAt = new Date();
  await user.save();

  const identity: AuthenticatedUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? undefined,
    role: "user",
  };

  return { user: identity, token: await issueUserToken(identity) };
}

export async function verifyUserToken(token: string): Promise<AuthenticatedUser> {
  try {
    const { payload } = await jwtVerify(token, jwtKey, { algorithms: ["HS256"] });
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      payload.role !== "user" ||
      typeof payload.name !== "string"
    ) {
      throw new Error("Invalid token claims");
    }

    const user = await User.findOne({ _id: payload.sub, isActive: true }).lean();
    if (!user) {
      throw new Error("User no longer active");
    }

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      phone: user.phone ?? undefined,
      role: "user",
    };
  } catch {
    throw new AppError(401, "Invalid or expired access token");
  }
}

export async function getUserProfile(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user || !user.isActive) {
    throw new AppError(404, "User not found");
  }

  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    createdAt: user.createdAt,
  };
}

export async function listUserBookings(userId: string) {
  return Booking.find({ userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
}

export async function getUserBookingByReference(userId: string, reference: string) {
  const booking = await Booking.findOne({
    userId,
    bookingReference: reference.trim().toUpperCase(),
  }).lean();

  if (!booking) {
    throw new AppError(404, "Booking not found");
  }

  return booking;
}

export async function listUserTaxiBookings(userId: string) {
  return TaxiBooking.find({ userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("driverId", "name email phone vehicleLabel")
    .lean();
}
