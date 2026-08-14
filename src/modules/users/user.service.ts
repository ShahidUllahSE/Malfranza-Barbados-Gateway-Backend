import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import { evaluateCancellation } from "../bookings/cancellation.js";
import { Booking } from "../bookings/booking.model.js";
import { sendPasswordResetEmail, sendSignupOtpEmail } from "../notifications/email.service.js";
import { TaxiBooking } from "../taxi/taxi.model.js";
import { SignupOtp } from "./signup-otp.model.js";
import { User } from "./user.model.js";
import type {
  LoginUserInput,
  RegisterUserInput,
  ResendSignupOtpInput,
  VerifySignupOtpInput,
} from "./user.validation.js";

const jwtKey = new TextEncoder().encode(env.JWT_SECRET);
const dummyHashPromise = bcrypt.hash(randomUUID(), 12);

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_EXPIRES_MINUTES = 10;

function hashOtpCode(email: string, code: string) {
  return createHash("sha256")
    .update(`${email}:${code}:${env.JWT_SECRET}`)
    .digest("hex");
}

function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

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

/**
 * Step 1 of signup — store pending profile + email a 6-digit OTP.
 * Account is only created after verifySignupOtp.
 */
export async function startSignupWithOtp(input: RegisterUserInput) {
  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    throw new AppError(409, "An account with this email already exists");
  }

  const pending = await SignupOtp.findOne({ email: input.email });
  if (pending?.lastSentAt) {
    const waitMs = OTP_RESEND_COOLDOWN_MS - (Date.now() - pending.lastSentAt.getTime());
    if (waitMs > 0) {
      throw new AppError(
        429,
        `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code`,
      );
    }
  }

  const code = generateOtpCode();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const codeHash = hashOtpCode(input.email, code);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await SignupOtp.findOneAndUpdate(
    { email: input.email },
    {
      $set: {
        name: input.name,
        phone: input.phone,
        passwordHash,
        codeHash,
        attempts: 0,
        lastSentAt: now,
        expiresAt,
      },
    },
    { upsert: true, new: true },
  );

  const mail = await sendSignupOtpEmail({
    to: input.email,
    name: input.name,
    code,
    expiresMinutes: OTP_EXPIRES_MINUTES,
  });

  return {
    email: input.email,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    emailSent: mail.sent,
    message: mail.sent
      ? "We sent a verification code to your email."
      : "Verification code prepared (SMTP not configured — check server logs in development).",
  };
}

export async function resendSignupOtp(input: ResendSignupOtpInput) {
  const pending = await SignupOtp.findOne({ email: input.email });
  if (!pending) {
    throw new AppError(404, "No pending signup found for this email. Start signup again.");
  }

  if (pending.expiresAt.getTime() < Date.now()) {
    await SignupOtp.deleteOne({ _id: pending._id });
    throw new AppError(410, "Your signup session expired. Please start again.");
  }

  const waitMs = OTP_RESEND_COOLDOWN_MS - (Date.now() - pending.lastSentAt.getTime());
  if (waitMs > 0) {
    throw new AppError(
      429,
      `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code`,
    );
  }

  const code = generateOtpCode();
  pending.codeHash = hashOtpCode(input.email, code);
  pending.attempts = 0;
  pending.lastSentAt = new Date();
  pending.expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await pending.save();

  const mail = await sendSignupOtpEmail({
    to: input.email,
    name: pending.name,
    code,
    expiresMinutes: OTP_EXPIRES_MINUTES,
  });

  return {
    email: input.email,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    emailSent: mail.sent,
    message: mail.sent
      ? "A new verification code was sent to your email."
      : "New code prepared (SMTP not configured — check server logs in development).",
  };
}

/**
 * Step 2 of signup — verify OTP and create the user account.
 */
export async function verifySignupOtp(input: VerifySignupOtpInput) {
  const pending = await SignupOtp.findOne({ email: input.email });
  if (!pending) {
    throw new AppError(404, "No pending signup found. Please start signup again.");
  }

  if (pending.expiresAt.getTime() < Date.now()) {
    await SignupOtp.deleteOne({ _id: pending._id });
    throw new AppError(410, "Verification code expired. Please start signup again.");
  }

  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    await SignupOtp.deleteOne({ _id: pending._id });
    throw new AppError(429, "Too many incorrect codes. Please start signup again.");
  }

  const expected = hashOtpCode(input.email, input.code);
  if (expected !== pending.codeHash) {
    pending.attempts += 1;
    await pending.save();
    const left = OTP_MAX_ATTEMPTS - pending.attempts;
    throw new AppError(
      400,
      left > 0
        ? `Invalid code. ${left} attempt${left === 1 ? "" : "s"} remaining.`
        : "Too many incorrect codes. Please start signup again.",
    );
  }

  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    await SignupOtp.deleteOne({ _id: pending._id });
    throw new AppError(409, "An account with this email already exists");
  }

  const user = await User.create({
    name: pending.name,
    email: pending.email,
    passwordHash: pending.passwordHash,
    phone: pending.phone,
    accountSource: "self",
  });

  await SignupOtp.deleteOne({ _id: pending._id });

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
 * Checkout "Create an account" path — create account with the guest's chosen password
 * and sign them in immediately (no temp password email).
 */
export async function registerCheckoutAccount(input: RegisterUserInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    throw new AppError(
      409,
      "An account with this email already exists. Sign in, or continue as guest with this email.",
    );
  }

  // Drop any incomplete OTP signup for this email so checkout registration can proceed.
  await SignupOtp.deleteMany({ email });

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    name: input.name.trim(),
    email,
    phone: input.phone,
    passwordHash,
    accountSource: "self",
    mustChangePassword: false,
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
  const items = await Booking.find({ userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return items.map((booking) => ({
    ...booking,
    cancellation: evaluateCancellation({
      eventDate: booking.checkIn,
      paymentStatus: booking.paymentStatus,
      amount: Number(booking.totalAmount),
      status: booking.status,
      kind: "stay",
    }),
  }));
}

export async function getUserBookingByReference(userId: string, reference: string) {
  const booking = await Booking.findOne({
    userId,
    bookingReference: reference.trim().toUpperCase(),
  }).lean();

  if (!booking) {
    throw new AppError(404, "Booking not found");
  }

  return {
    ...booking,
    cancellation: evaluateCancellation({
      eventDate: booking.checkIn,
      paymentStatus: booking.paymentStatus,
      amount: Number(booking.totalAmount),
      status: booking.status,
      kind: "stay",
    }),
  };
}

export async function listUserTaxiBookings(userId: string) {
  const items = await TaxiBooking.find({ userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("driverId", "name email phone vehicleLabel")
    .lean();

  return items.map((trip) => {
    const showDriver =
      trip.status === "assigned" || trip.status === "en_route" || trip.status === "completed";
    return {
      ...(showDriver ? trip : { ...trip, driverId: null }),
      cancellation: evaluateCancellation({
        eventDate: trip.pickupDate,
        paymentStatus: trip.paymentStatus,
        amount: Number(trip.estimatedFare),
        status: trip.status,
        kind: "taxi",
      }),
    };
  });
}

export async function requestUserPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const user = await User.findOne({ email }).lean();
  if (!user || !user.isActive) {
    return { ok: true as const };
  }

  const token = await new SignJWT({ purpose: "user_password_reset", email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user._id.toString())
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(jwtKey);

  const resetUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/?auth=reset&token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl,
    expiresMinutes: 60,
    kind: "guest",
  });
  return { ok: true as const };
}

export async function resetUserPassword(token: string, newPassword: string) {
  let payload: { sub?: string; purpose?: string };
  try {
    const verified = await jwtVerify(token, jwtKey);
    payload = verified.payload as { sub?: string; purpose?: string };
  } catch {
    throw new AppError(400, "This reset link is invalid or has expired");
  }
  if (payload.purpose !== "user_password_reset" || !payload.sub) {
    throw new AppError(400, "This reset link is invalid or has expired");
  }

  const user = await User.findById(payload.sub).select("+passwordHash");
  if (!user || !user.isActive) {
    throw new AppError(400, "This reset link is invalid or has expired");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  await user.save();
  return { ok: true as const };
}
