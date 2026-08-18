import mongoose from "mongoose";
import { AppError } from "../../middleware/error-handler.js";
import { TravelAgency } from "../agencies/agency.model.js";
import { Admin } from "../auth/admin.model.js";
import { Driver } from "../drivers/driver.model.js";
import { listGuestUsersAdmin, setGuestUserActive } from "./user.service.js";
import { User } from "./user.model.js";

export const DIRECTORY_KINDS = ["guest", "admin", "agency", "driver"] as const;
export type DirectoryKind = (typeof DIRECTORY_KINDS)[number];
export type DirectoryStatus = "active" | "blocked" | "deleted";

export type DirectoryAccount = {
  id: string;
  kind: DirectoryKind;
  name: string;
  email: string;
  phone: string | null;
  detail: string | null;
  status: DirectoryStatus;
  stayBookings: number;
  taxiBookings: number;
  lastLoginAt: string | null;
  createdAt: string;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function statusOf(isActive: boolean, deletedAt?: Date | null): DirectoryStatus {
  if (deletedAt) return "deleted";
  if (!isActive) return "blocked";
  return "active";
}

function assertId(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "Invalid account ID");
  }
}

async function assertCanChangeAdmin(adminId: string, actorId: string, action: "block" | "delete") {
  if (adminId === actorId) {
    throw new AppError(400, action === "delete" ? "You cannot delete your own account" : "You cannot block your own account");
  }
  const otherActiveAdmins = await Admin.countDocuments({
    _id: { $ne: adminId },
    isActive: true,
    $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }],
  });
  if (otherActiveAdmins === 0) {
    throw new AppError(400, "Keep at least one active admin");
  }
}

export async function listDirectoryAccounts(): Promise<DirectoryAccount[]> {
  const [guests, admins, agencies, drivers] = await Promise.all([
    listGuestUsersAdmin(),
    Admin.find().sort({ createdAt: -1 }).limit(200).lean(),
    TravelAgency.find().sort({ createdAt: -1 }).limit(200).lean(),
    Driver.find().sort({ createdAt: -1 }).limit(200).lean(),
  ]);

  const items: DirectoryAccount[] = [
    ...guests.map((user) => ({
      id: user.id,
      kind: "guest" as const,
      name: user.name,
      email: user.email,
      phone: user.phone,
      detail: user.accountSource === "guest_booking" ? "From booking" : "Signed up",
      status: statusOf(user.isActive, user.deletedAt ? new Date(user.deletedAt) : null),
      stayBookings: user.stayBookings,
      taxiBookings: user.taxiBookings,
      lastLoginAt: toIso(user.lastLoginAt),
      createdAt: toIso(user.createdAt) ?? new Date().toISOString(),
    })),
    ...admins.map((admin) => ({
      id: admin._id.toString(),
      kind: "admin" as const,
      name: admin.email.split("@")[0] || admin.email,
      email: admin.email,
      phone: null,
      detail: "Admin panel",
      status: statusOf(admin.isActive, admin.deletedAt),
      stayBookings: 0,
      taxiBookings: 0,
      lastLoginAt: toIso(admin.lastLoginAt),
      createdAt: toIso(admin.createdAt) ?? new Date().toISOString(),
    })),
    ...agencies.map((agency) => ({
      id: agency._id.toString(),
      kind: "agency" as const,
      name: agency.contactName,
      email: agency.email,
      phone: agency.phone ?? null,
      detail: agency.agencyName,
      status: statusOf(agency.isActive, agency.deletedAt),
      stayBookings: 0,
      taxiBookings: 0,
      lastLoginAt: toIso(agency.lastLoginAt),
      createdAt: toIso(agency.createdAt) ?? new Date().toISOString(),
    })),
    ...drivers.map((driver) => ({
      id: driver._id.toString(),
      kind: "driver" as const,
      name: driver.name,
      email: driver.email,
      phone: driver.phone ?? null,
      detail: driver.vehicleLabel || "Driver",
      status: statusOf(driver.isActive, driver.deletedAt),
      stayBookings: 0,
      taxiBookings: 0,
      lastLoginAt: toIso(driver.lastLoginAt),
      createdAt: toIso(driver.createdAt) ?? new Date().toISOString(),
    })),
  ];

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

export async function setDirectoryAccountBlocked(
  kind: DirectoryKind,
  id: string,
  blocked: boolean,
  actorId: string,
) {
  assertId(id);
  if (kind === "admin") {
    if (blocked) await assertCanChangeAdmin(id, actorId, "block");
    const admin = await Admin.findById(id);
    if (!admin) throw new AppError(404, "Admin not found");
    if (admin.deletedAt) throw new AppError(400, "Restore this account before changing block status");
    admin.isActive = !blocked;
    await admin.save();
    return { id: admin.id, kind, status: statusOf(admin.isActive, admin.deletedAt) };
  }

  if (kind === "guest") {
    const user = await User.findById(id);
    if (!user) throw new AppError(404, "User not found");
    if (user.deletedAt) throw new AppError(400, "Restore this account before changing block status");
    await setGuestUserActive(id, !blocked);
    return { id, kind, status: blocked ? "blocked" : "active" };
  }

  if (kind === "agency") {
    const agency = await TravelAgency.findById(id);
    if (!agency) throw new AppError(404, "Travel agent not found");
    if (agency.deletedAt) throw new AppError(400, "Restore this account before changing block status");
    agency.isActive = !blocked;
    await agency.save();
    return { id: agency.id, kind, status: statusOf(agency.isActive, agency.deletedAt) };
  }

  const driver = await Driver.findById(id);
  if (!driver) throw new AppError(404, "Driver not found");
  if (driver.deletedAt) throw new AppError(400, "Restore this account before changing block status");
  driver.isActive = !blocked;
  await driver.save();
  return { id: driver.id, kind, status: statusOf(driver.isActive, driver.deletedAt) };
}

export async function deleteDirectoryAccount(kind: DirectoryKind, id: string, actorId: string) {
  assertId(id);
  const now = new Date();

  if (kind === "admin") {
    await assertCanChangeAdmin(id, actorId, "delete");
    const admin = await Admin.findByIdAndUpdate(
      id,
      { $set: { isActive: false, deletedAt: now } },
      { new: true },
    );
    if (!admin) throw new AppError(404, "Admin not found");
    return { id: admin.id, kind, status: "deleted" as const };
  }

  if (kind === "guest") {
    const user = await User.findByIdAndUpdate(
      id,
      { $set: { isActive: false, deletedAt: now } },
      { new: true },
    );
    if (!user) throw new AppError(404, "User not found");
    return { id: user.id, kind, status: "deleted" as const };
  }

  if (kind === "agency") {
    const agency = await TravelAgency.findByIdAndUpdate(
      id,
      { $set: { isActive: false, deletedAt: now } },
      { new: true },
    );
    if (!agency) throw new AppError(404, "Travel agent not found");
    return { id: agency.id, kind, status: "deleted" as const };
  }

  const driver = await Driver.findByIdAndUpdate(
    id,
    { $set: { isActive: false, deletedAt: now } },
    { new: true },
  );
  if (!driver) throw new AppError(404, "Driver not found");
  return { id: driver.id, kind, status: "deleted" as const };
}

export async function restoreDirectoryAccount(kind: DirectoryKind, id: string) {
  assertId(id);
  const update = { $set: { isActive: true, deletedAt: null } };

  if (kind === "admin") {
    const admin = await Admin.findByIdAndUpdate(id, update, { new: true });
    if (!admin) throw new AppError(404, "Admin not found");
    return { id: admin.id, kind, status: "active" as const };
  }
  if (kind === "guest") {
    const user = await User.findByIdAndUpdate(id, update, { new: true });
    if (!user) throw new AppError(404, "User not found");
    return { id: user.id, kind, status: "active" as const };
  }
  if (kind === "agency") {
    const agency = await TravelAgency.findByIdAndUpdate(id, update, { new: true });
    if (!agency) throw new AppError(404, "Travel agent not found");
    return { id: agency.id, kind, status: "active" as const };
  }
  const driver = await Driver.findByIdAndUpdate(id, update, { new: true });
  if (!driver) throw new AppError(404, "Driver not found");
  return { id: driver.id, kind, status: "active" as const };
}
