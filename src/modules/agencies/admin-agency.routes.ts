import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  getAdminAgencies,
  getAdminAgencyCommission,
  patchAdminAgencyActive,
} from "./admin-agency.controller.js";

export const adminAgencyRouter = Router();

adminAgencyRouter.use(authenticateAdmin, requireRole("admin", "staff"));
adminAgencyRouter.get("/", getAdminAgencies);
adminAgencyRouter.get("/commission", getAdminAgencyCommission);
adminAgencyRouter.patch("/:id/active", patchAdminAgencyActive);
