import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  deleteTaxiBooking,
  getAdminTaxiBooking,
  getAdminTaxiBookings,
  getAdminTaxiSettings,
  patchTaxiBookingStatus,
  postAssignTaxiDriver,
  putAdminTaxiSettings,
} from "./admin-taxi.controller.js";

export const adminTaxiRouter = Router();

adminTaxiRouter.use(authenticateAdmin);
adminTaxiRouter.use(requireRole("admin", "staff"));

adminTaxiRouter.get("/", getAdminTaxiBookings);
adminTaxiRouter.get("/settings", getAdminTaxiSettings);
adminTaxiRouter.put("/settings", requireRole("admin"), putAdminTaxiSettings);
adminTaxiRouter.get("/:id", getAdminTaxiBooking);
adminTaxiRouter.patch("/:id/status", patchTaxiBookingStatus);
adminTaxiRouter.post("/:id/assign", postAssignTaxiDriver);
adminTaxiRouter.delete("/:id", requireRole("admin"), deleteTaxiBooking);
