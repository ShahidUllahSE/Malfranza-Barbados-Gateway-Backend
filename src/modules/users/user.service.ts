import { randomBytes, randomUUID } from "node:crypto";
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

function generateTemporaryPassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i += 1) {
    password += alphabet[bytes[i]! % alphabet.length];
  }
  return password;
}

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

/**
 * Find or create a guest account for checkout.
 * - Existing users: reuse (do not reset password / re-email credentials).
 * - New users: generate a temporary password and return it once for emailing.
 */
export async function ensureGuestAccount(input: {
  name: string;
  email: string;
  phone?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || "Guest";
  const phone = input.phone?.trim() || undefined;

  const existing = await User.findOne({ email });
  if (existing) {
    if (!existing.isActive) {
      throw new AppError(403, "This account is inactive. Please contact support.");
    }
    if (phone && !existing.phone) {
      existing.phone = phone;
      await existing.save();
    }

    const identity: AuthenticatedUser = {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      phone: existing.phone ?? undefined,
      role: "user",
    };

    return {
      user: identity,
      token: await issueUserToken(identity),
      accountCreated: false as const,
      plainPassword: undefined as string | undefined,
    };
  }

  const plainPassword = generateTemporaryPassword(12);
  const passwordHash = await bcrypt.hash(plainPassword, 12);
  const user = await User.create({
    name,
    email,
    phone,
    passwordHash,
    accountSource: "guest_booking",
    mustChangePassword: true,
  });

  const identity: AuthenticatedUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? undefined,
    role: "user",
  };

  return {
    user: identity,
    token: await issueUserToken(identity),
    accountCreated: true as const,
    plainPassword,
  };
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
