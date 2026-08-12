import { Types } from "mongoose";
import { AppError } from "../../middleware/error-handler.js";
import { UserNotification } from "./user-notification.model.js";

export async function createUserNotification(input: {
  userId: string;
  type?: string;
  title: string;
  body: string;
  href: string;
  entityId?: string;
}) {
  if (!Types.ObjectId.isValid(input.userId)) return null;
  return UserNotification.create({
    userId: input.userId,
    type: input.type ?? "taxi",
    title: input.title,
    body: input.body,
    href: input.href,
    entityId: input.entityId,
  });
}

export async function listUserNotifications(userId: string, input: { limit?: number } = {}) {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const [items, unreadCount] = await Promise.all([
    UserNotification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    UserNotification.countDocuments({ userId, readAt: null }),
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

export async function markUserNotificationRead(userId: string, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, "Invalid notification ID");
  const item = await UserNotification.findOneAndUpdate(
    { _id: id, userId },
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean();
  if (!item) throw new AppError(404, "Notification not found");
  return { id: item._id.toString(), read: true };
}

export async function markAllUserNotificationsRead(userId: string) {
  const result = await UserNotification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return { updated: result.modifiedCount };
}
