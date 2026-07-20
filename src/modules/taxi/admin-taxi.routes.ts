import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  deleteTaxiBooking,
  getAdminTaxiBooking,
  getAdminTaxiBookings,
  patchTaxiBookingStatus,
  postAssignTaxiDriver,
} from "./admin-taxi.controller.js";

export const adminTaxiRouter = Router();

adminTaxiRouter.use(authenticateAdmin);
adminTaxiRouter.use(requireRole("admin", "staff"));

adminTaxiRouter.get("/", getAdminTaxiBookings);
adminTaxiRouter.get("/:id", getAdminTaxiBooking);
adminTaxiRouter.patch("/:id/status", patchTaxiBookingStatus);
adminTaxiRouter.post("/:id/assign", postAssignTaxiDriver);
adminTaxiRouter.delete("/:id", requireRole("admin"), deleteTaxiBooking);
