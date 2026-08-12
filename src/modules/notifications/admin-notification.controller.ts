import type { RequestHandler } from "express";
import {
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "./admin-notification.service.js";

export const getAdminNotifications: RequestHandler = async (request, response) => {
  const limit = request.query.limit ? Number(request.query.limit) : undefined;
  const data = await listAdminNotifications({ limit });
  response.status(200).json({ success: true, data });
};

export const patchAdminNotificationRead: RequestHandler = async (request, response) => {
  const data = await markAdminNotificationRead(String(request.params.id));
  response.status(200).json({ success: true, data });
};

export const postAdminNotificationsReadAll: RequestHandler = async (_request, response) => {
  const data = await markAllAdminNotificationsRead();
  response.status(200).json({ success: true, data });
};
