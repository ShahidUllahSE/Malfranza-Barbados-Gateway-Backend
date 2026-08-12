import { Types } from "mongoose";
import { AppError } from "../../middleware/error-handler.js";
import {
  AdminNotification,
  type AdminNotificationType,
} from "./admin-notification.model.js";

export async function createAdminNotification(input: {
  type: AdminNotificationType;
  title: string;
  body: string;
  href: string;
  entityId?: string;
}) {
  return AdminNotification.create({
    type: input.type,
    title: input.title,
    body: input.body,
    href: input.href,
    entityId: input.entityId,
  });
}

export async function listAdminNotifications(input: { limit?: number } = {}) {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const [items, unreadCount] = await Promise.all([
    AdminNotification.find().sort({ createdAt: -1 }).limit(limit).lean(),
    AdminNotification.countDocuments({ readAt: null }),
  ]);

  return {
    unreadCount,
    items: items.map((item) => ({
      id: item._id.toString(),
      type: item.type,
      title: item.title,
      body: item.body,
      href: item.href,
      entityId: item.entityId ?? null,
      read: Boolean(item.readAt),
      createdAt: item.createdAt,
    })),
  };
}

export async function markAdminNotificationRead(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, "Invalid notification ID");
  const item = await AdminNotification.findByIdAndUpdate(
    id,
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean();
  if (!item) throw new AppError(404, "Notification not found");
  return { id: item._id.toString(), read: true };
}

export async function markAllAdminNotificationsRead() {
  const result = await AdminNotification.updateMany({ readAt: null }, { $set: { readAt: new Date() } });
  return { updated: result.modifiedCount };
}
