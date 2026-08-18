import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  getAdminAgencies,
  getAdminAgencyCommission,
  getAdminAgencySettings,
  patchAdminAgencyActive,
  patchAdminAgencySettings,
  postAdminCreateAgency,
} from "./admin-agency.controller.js";

export const adminAgencyRouter = Router();

adminAgencyRouter.use(authenticateAdmin, requireRole("admin"));
adminAgencyRouter.get("/", getAdminAgencies);
adminAgencyRouter.post("/", postAdminCreateAgency);
adminAgencyRouter.get("/commission", getAdminAgencyCommission);
adminAgencyRouter.get("/settings", getAdminAgencySettings);
adminAgencyRouter.patch("/settings", patchAdminAgencySettings);
adminAgencyRouter.patch("/:id/active", patchAdminAgencyActive);
