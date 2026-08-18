import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  deleteAdminBooking,
  getAdminBooking,
  getAdminBookings,
  patchBookingPayment,
  patchBookingStatus,
  postAdminBooking,
} from "./admin-booking.controller.js";

export const adminBookingRouter = Router();

adminBookingRouter.use(authenticateAdmin);
adminBookingRouter.use(requireRole("admin"));

adminBookingRouter.get("/", getAdminBookings);
adminBookingRouter.post("/", postAdminBooking);
adminBookingRouter.get("/:id", getAdminBooking);
adminBookingRouter.patch("/:id/status", patchBookingStatus);
adminBookingRouter.patch("/:id/payment", requireRole("admin"), patchBookingPayment);
adminBookingRouter.delete("/:id", requireRole("admin"), deleteAdminBooking);
