import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import mongoose, { Types, type QueryFilter } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import { Booking, type BookingRecord } from "../bookings/booking.model.js";
import {
  sendAdminNewAgencySignupEmail,
  sendAgencyWelcomeEmail,
  sendPasswordResetEmail,
} from "../notifications/email.service.js";
import {
  AGENCY_COMMISSION_RATE,
  TravelAgency,
} from "./agency.model.js";
import type {
  AgencyCommissionQuery,
  LoginAgencyInput,
  RegisterAgencyInput,
} from "./agency.validation.js";

const jwtKey = new TextEncoder().encode(env.JWT_SECRET);

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

export async function registerAgency(input: RegisterAgencyInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await TravelAgency.findOne({ email }).lean();
  if (existing) {
    throw new AppError(409, "An agency account with this email already exists");
  }

  const agencyCode = await generateUniqueAgencyCode();
  const passwordHash = await bcrypt.hash(input.password, 12);

  const agency = await TravelAgency.create({
    agencyName: input.agencyName.trim(),
    contactName: input.contactName.trim(),
    email,
    phone: input.phone.trim(),
    passwordHash,
    agencyCode,
    commissionRate: AGENCY_COMMISSION_RATE,
    isActive: true,
  });

  const identity = toIdentity(agency);

  await sendAgencyWelcomeEmail({
    to: agency.email,
    contactName: agency.contactName,
    agencyName: agency.agencyName,
    agencyCode: agency.agencyCode,
  }).catch((error) => {
    console.error("[email] Failed to send agency welcome", error);
  });

  await sendAdminNewAgencySignupEmail({
    agencyName: agency.agencyName,
    contactName: agency.contactName,
    email: agency.email,
    phone: agency.phone,
    agencyCode: agency.agencyCode,
  }).catch((error) => {
    console.error("[email] Failed to send admin agency signup alert", error);
  });

  return {
    agency: identity,
    token: await issueAgencyToken(identity),
  };
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
    commissionRate: AGENCY_COMMISSION_RATE,
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
