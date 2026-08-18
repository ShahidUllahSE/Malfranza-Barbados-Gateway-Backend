import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import { loginUser, type AuthenticatedUser } from "../users/user.service.js";
import { loginDriver, type AuthenticatedDriver } from "../drivers/driver.service.js";
import {
  loginAgency,
  type AuthenticatedAgency,
} from "../agencies/agency.service.js";
import { TravelAgency } from "../agencies/agency.model.js";
import { Admin } from "./admin.model.js";
import { Driver } from "../drivers/driver.model.js";
import type { BootstrapAdminInput, CreateAdminAccountInput, LoginInput } from "./auth.validation.js";

const jwtKey = new TextEncoder().encode(env.JWT_SECRET);
const dummyHashPromise = bcrypt.hash(randomUUID(), 12);

export type AuthenticatedAdmin = {
  id: string;
  email: string;
  role: "admin" | "staff";
};

/** Unified login result for a single sign-in surface (admin/staff, driver, or guest). */
export type SessionLoginResult =
  | {
      kind: "admin";
      role: "admin" | "staff";
      token: string;
      admin: AuthenticatedAdmin;
      user?: never;
      driver?: never;
    }
  | {
      kind: "driver";
      role: "driver";
      token: string;
      driver: AuthenticatedDriver;
      admin?: never;
      user?: never;
    }
  | {
      kind: "user";
      role: "user";
      token: string;
      user: AuthenticatedUser;
      admin?: never;
      driver?: never;
      agency?: never;
    }
  | {
      kind: "agency";
      role: "agency";
      token: string;
      agency: AuthenticatedAgency;
      admin?: never;
      user?: never;
      driver?: never;
    };

async function issueToken(admin: AuthenticatedAdmin): Promise<string> {
  return new SignJWT({ email: admin.email, role: admin.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(admin.id)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_EXPIRES_IN}s`)
    .sign(jwtKey);
}

export async function bootstrapAdmin(input: BootstrapAdminInput) {
  if (input.bootstrapKey !== env.ADMIN_BOOTSTRAP_KEY) {
    throw new AppError(403, "Invalid bootstrap key");
  }

  if ((await Admin.countDocuments()) > 0) {
    throw new AppError(409, "Admin bootstrap has already been completed");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const admin = await Admin.create({
    email: input.email,
    passwordHash,
    role: "admin",
  });

  const identity: AuthenticatedAdmin = {
    id: admin.id,
    email: admin.email,
    role: admin.role,
  };

  return { admin: identity, token: await issueToken(identity) };
}

export async function login(input: LoginInput) {
  await promoteStaffAccountsToAdmin();
  const admin = await Admin.findOne({ email: input.email }).select("+passwordHash");
  const passwordHash = admin?.passwordHash ?? (await dummyHashPromise);
  const validPassword = await bcrypt.compare(input.password, passwordHash);

  if (!admin || !validPassword || !admin.isActive || admin.deletedAt) {
    throw new AppError(401, "Invalid email or password");
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const identity: AuthenticatedAdmin = {
    id: admin.id,
    email: admin.email,
    role: admin.role,
  };

  return { admin: identity, token: await issueToken(identity) };
}

/**
 * Single sign-in for guests, drivers, staff, and travel agencies.
 * Precedence: Admin → Driver → Agency → User.
 */
export async function loginSession(input: LoginInput): Promise<SessionLoginResult> {
  const adminExists = await Admin.exists({ email: input.email });
  if (adminExists) {
    const { admin, token } = await login(input);
    return { kind: "admin", role: admin.role, token, admin };
  }

  const driverExists = await Driver.exists({ email: input.email });
  if (driverExists) {
    const { driver, token } = await loginDriver(input);
    return { kind: "driver", role: "driver", token, driver };
  }

  const agencyExists = await TravelAgency.exists({ email: input.email });
  if (agencyExists) {
    const { agency, token } = await loginAgency(input);
    return { kind: "agency", role: "agency", token, agency };
  }

  const { user, token } = await loginUser(input);
  return { kind: "user", role: "user", token, user };
}

export async function verifyAdminToken(token: string): Promise<AuthenticatedAdmin> {
  try {
    const { payload } = await jwtVerify(token, jwtKey, { algorithms: ["HS256"] });
    const role = payload.role;

    if (!payload.sub || typeof payload.email !== "string" || (role !== "admin" && role !== "staff")) {
      throw new Error("Invalid token claims");
    }

    const admin = await Admin.findOne({
      _id: payload.sub,
      isActive: true,
    });

    if (!admin) {
      throw new Error("Admin no longer active");
    }

    if (admin.role === "staff") {
      admin.role = "admin";
      await admin.save();
    }

    return {
      id: admin._id.toString(),
      email: admin.email,
      role: "admin" as const,
    };
  } catch {
    throw new AppError(401, "Invalid or expired access token");
  }
}

async function promoteStaffAccountsToAdmin() {
  await Admin.updateMany({ role: "staff" }, { $set: { role: "admin" } });
}

export async function createAdminAccount(input: CreateAdminAccountInput) {
  await promoteStaffAccountsToAdmin();
  const email = input.email.trim().toLowerCase();
  const existing = await Admin.findOne({ email }).lean();
  if (existing) {
    throw new AppError(409, "An admin account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const admin = await Admin.create({
    email,
    passwordHash,
    role: "admin",
    isActive: true,
  });

  return {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    createdAt: admin.createdAt,
    lastLoginAt: admin.lastLoginAt ?? null,
  };
}

export async function listAdminAccounts() {
  await promoteStaffAccountsToAdmin();
  const admins = await Admin.find({
    $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }],
  })
    .sort({ createdAt: 1 })
    .lean();
  return admins.map((admin) => ({
    id: admin._id.toString(),
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    createdAt: admin.createdAt,
    lastLoginAt: admin.lastLoginAt ?? null,
  }));
}

export async function setAdminAccountActive(
  adminId: string,
  isActive: boolean,
  actorId: string,
) {
  if (!mongoose.Types.ObjectId.isValid(adminId)) {
    throw new AppError(400, "Invalid admin ID");
  }
  if (adminId === actorId && !isActive) {
    throw new AppError(400, "You cannot deactivate your own account");
  }

  const admin = await Admin.findById(adminId);
  if (!admin) throw new AppError(404, "Admin not found");

  if (!isActive && admin.role === "admin") {
    const otherActiveAdmins = await Admin.countDocuments({
      _id: { $ne: admin._id },
      role: "admin",
      isActive: true,
      $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }],
    });
    if (otherActiveAdmins === 0) {
      throw new AppError(400, "Keep at least one active admin");
    }
  }

  admin.isActive = isActive;
  await admin.save();

  return {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
  };
}
