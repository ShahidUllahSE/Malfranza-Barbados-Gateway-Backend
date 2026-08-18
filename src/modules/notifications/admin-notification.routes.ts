import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  getAdminNotifications,
  patchAdminNotificationRead,
  postAdminNotificationsReadAll,
} from "./admin-notification.controller.js";

export const adminNotificationRouter = Router();

adminNotificationRouter.use(authenticateAdmin);
adminNotificationRouter.use(requireRole("admin"));

adminNotificationRouter.get("/", getAdminNotifications);
adminNotificationRouter.post("/read-all", postAdminNotificationsReadAll);
adminNotificationRouter.patch("/:id/read", patchAdminNotificationRead);
