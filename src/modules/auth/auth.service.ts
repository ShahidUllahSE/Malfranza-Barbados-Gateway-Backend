import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import { loginUser, type AuthenticatedUser } from "../users/user.service.js";
import { loginDriver, type AuthenticatedDriver } from "../drivers/driver.service.js";
import { Admin } from "./admin.model.js";
import { Driver } from "../drivers/driver.model.js";
import type { BootstrapAdminInput, LoginInput } from "./auth.validation.js";

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
  const admin = await Admin.findOne({ email: input.email }).select("+passwordHash");
  const passwordHash = admin?.passwordHash ?? (await dummyHashPromise);
  const validPassword = await bcrypt.compare(input.password, passwordHash);

  if (!admin || !validPassword || !admin.isActive) {
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
 * Single sign-in for guests, drivers, and staff.
 * Precedence: Admin → Driver → User (first matching email collection wins).
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
    }).lean();

    if (!admin) {
      throw new Error("Admin no longer active");
    }

    return {
      id: admin._id.toString(),
      email: admin.email,
      role: admin.role,
    };
  } catch {
    throw new AppError(401, "Invalid or expired access token");
  }
}
