import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  getAdminAgencies,
  getAdminAgencyCommission,
  patchAdminAgencyActive,
  postAdminCreateAgency,
} from "./admin-agency.controller.js";

export const adminAgencyRouter = Router();

adminAgencyRouter.use(authenticateAdmin, requireRole("admin", "staff"));
adminAgencyRouter.get("/", getAdminAgencies);
adminAgencyRouter.post("/", postAdminCreateAgency);
adminAgencyRouter.get("/commission", getAdminAgencyCommission);
adminAgencyRouter.patch("/:id/active", patchAdminAgencyActive);
