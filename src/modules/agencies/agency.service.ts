import { createHash, randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import mongoose, { Types, type QueryFilter } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import { Booking, type BookingRecord } from "../bookings/booking.model.js";
import { createAdminNotification } from "../notifications/admin-notification.service.js";
import {
  sendAdminNewAgencySignupEmail,
  sendAgencySignupOtpEmail,
  sendAgencyWelcomeEmail,
  sendPasswordResetEmail,
} from "../notifications/email.service.js";
import {
  AGENCY_COMMISSION_RATE,
  TravelAgency,
} from "./agency.model.js";
import { AgencySignupOtp } from "./agency-signup-otp.model.js";
import { getDefaultCommissionRate } from "./agency-settings.service.js";
import type {
  AgencyCommissionQuery,
  LoginAgencyInput,
  RegisterAgencyInput,
  ResendAgencySignupOtpInput,
  VerifyAgencySignupOtpInput,
} from "./agency.validation.js";

const jwtKey = new TextEncoder().encode(env.JWT_SECRET);
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

export type AuthenticatedAgency = {
  id: string;
  email: string;
  agencyName: string;
  contactName: string;
  agencyCode: string;
  commissionRate: number;
  role: "agency";
};

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Unique auto-generated agency booking code — never user-assigned. */
async function generateUniqueAgencyCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `AG-${randomBytes(4).toString("hex").toUpperCase()}`;
    const exists = await TravelAgency.exists({ agencyCode: code });
    if (!exists) return code;
  }
  throw new AppError(500, "Could not generate a unique agency code");
}

async function issueAgencyToken(agency: AuthenticatedAgency): Promise<string> {
  return new SignJWT({
    email: agency.email,
    role: agency.role,
    agencyCode: agency.agencyCode,
    agencyName: agency.agencyName,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(agency.id)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_EXPIRES_IN}s`)
    .sign(jwtKey);
}

function toIdentity(agency: {
  _id: Types.ObjectId;
  email: string;
  agencyName: string;
  contactName: string;
  agencyCode: string;
  commissionRate?: number | null;
}): AuthenticatedAgency {
  return {
    id: agency._id.toString(),
    email: agency.email,
    agencyName: agency.agencyName,
    contactName: agency.contactName,
    agencyCode: agency.agencyCode,
    commissionRate: Number(agency.commissionRate ?? AGENCY_COMMISSION_RATE),
    role: "agency",
  };
}

export async function createAgencyByAdmin(input: RegisterAgencyInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await TravelAgency.findOne({ email }).lean();
  if (existing) {
    throw new AppError(409, "An agency account with this email already exists");
  }

  const agencyCode = await generateUniqueAgencyCode();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const commissionRate = await getDefaultCommissionRate();

  const agency = await TravelAgency.create({
    agencyName: input.agencyName.trim(),
    contactName: input.contactName.trim(),
    email,
    phone: input.phone.trim(),
    passwordHash,
    agencyCode,
    commissionRate,
    isActive: true,
  });

  const identity = toIdentity(agency);

  await sendAgencyWelcomeEmail({
    to: agency.email,
    contactName: agency.contactName,
    agencyName: agency.agencyName,
    agencyCode: agency.agencyCode,
    commissionRate,
  }).catch((error) => {
    console.error("[email] Failed to send agency welcome", error);
  });

  return { agency: identity };
}

/**
 * Public self-signup step 1 — store pending agency profile and email a 6-digit OTP.
 * Account is only created after verifyAgencySignupOtp.
 */
export async function startAgencySignupWithOtp(input: RegisterAgencyInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await TravelAgency.findOne({ email }).lean();
  if (existing) {
    throw new AppError(409, "An agency account with this email already exists");
  }

  const pending = await AgencySignupOtp.findOne({ email });
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
  const now = new Date();

  await AgencySignupOtp.findOneAndUpdate(
    { email },
    {
      $set: {
        agencyName: input.agencyName.trim(),
        contactName: input.contactName.trim(),
        phone: input.phone.trim(),
        passwordHash,
        codeHash: hashOtpCode(email, code),
        attempts: 0,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      },
    },
    { upsert: true, new: true },
  );

  const mail = await sendAgencySignupOtpEmail({
    to: email,
    name: input.contactName.trim(),
    agencyName: input.agencyName.trim(),
    code,
    expiresMinutes: OTP_EXPIRES_MINUTES,
  });

  return {
    email,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    emailSent: mail.sent,
    message: mail.sent
      ? "We sent a verification code to your email."
      : "Verification code prepared (SMTP not configured — check server logs in development).",
  };
}

export async function resendAgencySignupOtp(input: ResendAgencySignupOtpInput) {
  const email = input.email.trim().toLowerCase();
  const pending = await AgencySignupOtp.findOne({ email });
  if (!pending) {
    throw new AppError(404, "No pending signup found for this email. Start signup again.");
  }

  if (pending.expiresAt.getTime() < Date.now()) {
    await AgencySignupOtp.deleteOne({ _id: pending._id });
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
  pending.codeHash = hashOtpCode(email, code);
  pending.attempts = 0;
  pending.lastSentAt = new Date();
  pending.expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await pending.save();

  const mail = await sendAgencySignupOtpEmail({
    to: email,
    name: pending.contactName,
    agencyName: pending.agencyName,
    code,
    expiresMinutes: OTP_EXPIRES_MINUTES,
  });

  return {
    email,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    emailSent: mail.sent,
    message: mail.sent
      ? "A new verification code was sent to your email."
      : "New code prepared (SMTP not configured — check server logs in development).",
  };
}

/** Public self-signup step 2 — verify OTP and create the agency account. */
export async function verifyAgencySignupOtp(input: VerifyAgencySignupOtpInput) {
  const email = input.email.trim().toLowerCase();
  const pending = await AgencySignupOtp.findOne({ email });
  if (!pending) {
    throw new AppError(404, "No pending signup found. Please start signup again.");
  }

  if (pending.expiresAt.getTime() < Date.now()) {
    await AgencySignupOtp.deleteOne({ _id: pending._id });
    throw new AppError(410, "Verification code expired. Please start signup again.");
  }

  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    await AgencySignupOtp.deleteOne({ _id: pending._id });
    throw new AppError(429, "Too many incorrect codes. Please start signup again.");
  }

  const expected = hashOtpCode(email, input.code);
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

  const existing = await TravelAgency.findOne({ email }).lean();
  if (existing) {
    await AgencySignupOtp.deleteOne({ _id: pending._id });
    throw new AppError(409, "An agency account with this email already exists");
  }

  const agencyCode = await generateUniqueAgencyCode();
  const commissionRate = await getDefaultCommissionRate();
  const agency = await TravelAgency.create({
    agencyName: pending.agencyName,
    contactName: pending.contactName,
    email,
    phone: pending.phone,
    passwordHash: pending.passwordHash,
    agencyCode,
    commissionRate,
    isActive: true,
  });

  await AgencySignupOtp.deleteOne({ _id: pending._id });

  const identity = toIdentity(agency);

  await Promise.all([
    sendAgencyWelcomeEmail({
      to: agency.email,
      contactName: agency.contactName,
      agencyName: agency.agencyName,
      agencyCode: agency.agencyCode,
      commissionRate,
    }).catch((error) => {
      console.error("[email] Failed to send agency welcome", error);
    }),
    sendAdminNewAgencySignupEmail({
      agencyName: agency.agencyName,
      contactName: agency.contactName,
      email: agency.email,
      phone: agency.phone,
      agencyCode: agency.agencyCode,
    }).catch((error) => {
      console.error("[email] Failed to send admin agency signup", error);
    }),
    createAdminNotification({
      type: "agency_signup",
      title: `New travel agent — ${agency.agencyName}`,
      body: `${agency.contactName} · ${agency.email} · ${agency.agencyCode}`,
      href: "/admin/agencies",
      entityId: identity.id,
    }).catch((error) => {
      console.error("[notify] Failed to create agency signup notification", error);
    }),
  ]);

  return {
    agency: identity,
    token: await issueAgencyToken(identity),
  };
}

/** @deprecated Admin-created agencies — use createAgencyByAdmin */
export async function registerAgency(input: RegisterAgencyInput) {
  return createAgencyByAdmin(input);
}

export async function requestAgencyPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const agency = await TravelAgency.findOne({ email }).lean();
  // Always return ok to avoid email enumeration
  if (!agency || !agency.isActive) {
    return { ok: true as const };
  }

  const token = await new SignJWT({ purpose: "agency_password_reset", email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(agency._id.toString())
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(jwtKey);

  const resetUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/agency?reset=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail({
    to: agency.email,
    name: agency.contactName,
    resetUrl,
    expiresMinutes: 60,
    kind: "agency",
  });
  return { ok: true as const };
}

export async function resetAgencyPassword(token: string, newPassword: string) {
  let payload: { sub?: string; purpose?: string };
  try {
    const verified = await jwtVerify(token, jwtKey);
    payload = verified.payload as { sub?: string; purpose?: string };
  } catch {
    throw new AppError(400, "This reset link is invalid or has expired");
  }
  if (payload.purpose !== "agency_password_reset" || !payload.sub) {
    throw new AppError(400, "This reset link is invalid or has expired");
  }

  const agency = await TravelAgency.findById(payload.sub).select("+passwordHash");
  if (!agency || !agency.isActive) {
    throw new AppError(400, "This reset link is invalid or has expired");
  }

  agency.passwordHash = await bcrypt.hash(newPassword, 12);
  await agency.save();
  return { ok: true as const };
}

export async function loginAgency(input: LoginAgencyInput) {
  const email = input.email.trim().toLowerCase();
  const agency = await TravelAgency.findOne({ email }).select("+passwordHash");
  if (!agency || !agency.isActive) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(input.password, agency.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  agency.lastLoginAt = new Date();
  await agency.save();

  const identity = toIdentity(agency);
  return {
    agency: identity,
    token: await issueAgencyToken(identity),
  };
}

export async function verifyAgencyToken(token: string): Promise<AuthenticatedAgency> {
  try {
    const { payload } = await jwtVerify(token, jwtKey, { algorithms: ["HS256"] });
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      payload.role !== "agency"
    ) {
      throw new Error("Invalid token claims");
    }

    const agency = await TravelAgency.findOne({
      _id: payload.sub,
      isActive: true,
    }).lean();

    if (!agency) throw new Error("Agency no longer active");
    return toIdentity(agency);
  } catch {
    throw new AppError(401, "Invalid or expired access token");
  }
}

export async function getAgencyProfile(agencyId: string) {
  const agency = await TravelAgency.findById(agencyId).lean();
  if (!agency || !agency.isActive) {
    throw new AppError(404, "Agency not found");
  }
  return {
    id: agency._id.toString(),
    agencyName: agency.agencyName,
    contactName: agency.contactName,
    email: agency.email,
    phone: agency.phone,
    agencyCode: agency.agencyCode,
    commissionRate: Number(agency.commissionRate ?? AGENCY_COMMISSION_RATE),
    role: "agency" as const,
  };
}

/** Look up active agency by booking code (normalised). */
export async function findActiveAgencyByCode(rawCode: string | undefined | null) {
  if (!rawCode?.trim()) return null;
  const agencyCode = rawCode.trim().toUpperCase();
  const agency = await TravelAgency.findOne({ agencyCode, isActive: true }).lean();
  return agency;
}

export async function listAgencyBookings(agencyId: string) {
  const items = await Booking.find({
    agencyId: new Types.ObjectId(agencyId),
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return items.map(mapPortalBooking);
}

function mapPortalBooking(booking: any) {
  return {
    id: booking._id.toString(),
    bookingReference: booking.bookingReference,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    apartmentName: booking.apartmentName,
    unitName: booking.unitName ?? null,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    nights: booking.nights,
    staySubtotal: booking.staySubtotal,
    totalAmount: booking.totalAmount,
    commissionAmount: Number(booking.commissionAmount ?? 0),
    commissionRate: Number(booking.commissionRate ?? AGENCY_COMMISSION_RATE),
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    agencyCode: booking.agencyCode ?? null,
    createdAt: booking.createdAt,
  };
}

export async function getAgencyCommissionSummary(agencyId: string) {
  const agency = await TravelAgency.findById(agencyId).lean();
  if (!agency) throw new AppError(404, "Agency not found");

  const match: QueryFilter<BookingRecord> = {
    agencyId: new Types.ObjectId(agencyId),
    status: { $ne: "cancelled" },
  };

  const [agg] = await Booking.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        bookings: { $sum: 1 },
        stayRevenue: { $sum: "$staySubtotal" },
        commissionOwed: { $sum: "$commissionAmount" },
      },
    },
  ]);

  return {
    agencyCode: agency.agencyCode,
    agencyName: agency.agencyName,
    commissionRate: Number(agency.commissionRate ?? AGENCY_COMMISSION_RATE),
    bookings: agg?.bookings ?? 0,
    stayRevenue: money(agg?.stayRevenue ?? 0),
    commissionOwed: money(agg?.commissionOwed ?? 0),
  };
}

export async function listAgenciesAdmin() {
  const agencies = await TravelAgency.find()
    .sort({ createdAt: -1 })
    .lean();

  const ids = agencies.map((a) => a._id);
  const stats = await Booking.aggregate([
    {
      $match: {
        agencyId: { $in: ids },
        status: { $ne: "cancelled" },
      },
    },
    {
      $group: {
        _id: "$agencyId",
        bookings: { $sum: 1 },
        commissionOwed: { $sum: "$commissionAmount" },
        stayRevenue: { $sum: "$staySubtotal" },
      },
    },
  ]);

  const byId = new Map(stats.map((s) => [String(s._id), s]));

  return agencies.map((a) => {
    const s = byId.get(String(a._id));
    return {
      id: a._id.toString(),
      agencyName: a.agencyName,
      contactName: a.contactName,
      email: a.email,
      phone: a.phone,
      agencyCode: a.agencyCode,
      commissionRate: Number(a.commissionRate ?? AGENCY_COMMISSION_RATE),
      isActive: a.isActive,
      createdAt: a.createdAt,
      bookings: s?.bookings ?? 0,
      stayRevenue: money(s?.stayRevenue ?? 0),
      commissionOwed: money(s?.commissionOwed ?? 0),
    };
  });
}

export async function adminCommissionReport(query: AgencyCommissionQuery) {
  const filter: QueryFilter<BookingRecord> = {
    agencyId: { $exists: true, $ne: null },
    status: { $ne: "cancelled" },
  };

  if (query.agencyCode) {
    filter.agencyCode = query.agencyCode.trim().toUpperCase();
  }
  if (query.fromDate || query.toDate) {
    filter.checkIn = {};
    if (query.fromDate) {
      (filter.checkIn as Record<string, Date>).$gte = new Date(
        `${query.fromDate}T00:00:00.000Z`,
      );
    }
    if (query.toDate) {
      (filter.checkIn as Record<string, Date>).$lte = new Date(
        `${query.toDate}T23:59:59.999Z`,
      );
    }
  }

  const bookings = await Booking.find(filter)
    .sort({ checkIn: -1 })
    .limit(500)
    .lean();

  const byCode = new Map<
    string,
    {
      agencyCode: string;
      agencyName: string;
      bookings: number;
      stayRevenue: number;
      commissionOwed: number;
    }
  >();

  for (const b of bookings) {
    const code = String(b.agencyCode ?? "UNKNOWN");
    const row = byCode.get(code) ?? {
      agencyCode: code,
      agencyName: String(b.agencyName ?? code),
      bookings: 0,
      stayRevenue: 0,
      commissionOwed: 0,
    };
    row.bookings += 1;
    row.stayRevenue += Number(b.staySubtotal ?? 0);
    row.commissionOwed += Number(b.commissionAmount ?? 0);
    byCode.set(code, row);
  }

  const agencies = [...byCode.values()]
    .map((r) => ({
      ...r,
      stayRevenue: money(r.stayRevenue),
      commissionOwed: money(r.commissionOwed),
    }))
    .sort((a, b) => b.commissionOwed - a.commissionOwed);

  const totals = agencies.reduce(
    (acc, r) => {
      acc.bookings += r.bookings;
      acc.stayRevenue += r.stayRevenue;
      acc.commissionOwed += r.commissionOwed;
      return acc;
    },
    { bookings: 0, stayRevenue: 0, commissionOwed: 0 },
  );

  return {
    filters: {
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
      agencyCode: query.agencyCode ?? null,
    },
    commissionRate: await getDefaultCommissionRate(),
    totals: {
      bookings: totals.bookings,
      stayRevenue: money(totals.stayRevenue),
      commissionOwed: money(totals.commissionOwed),
    },
    agencies,
    bookings: bookings.map(mapPortalBooking),
  };
}

export async function setAgencyActive(agencyId: string, isActive: boolean) {
  if (!mongoose.Types.ObjectId.isValid(agencyId)) {
    throw new AppError(400, "Invalid agency ID");
  }
  const agency = await TravelAgency.findByIdAndUpdate(
    agencyId,
    { $set: { isActive } },
    { new: true },
  ).lean();
  if (!agency) throw new AppError(404, "Agency not found");
  return {
    id: agency._id.toString(),
    isActive: agency.isActive,
    agencyCode: agency.agencyCode,
  };
}
