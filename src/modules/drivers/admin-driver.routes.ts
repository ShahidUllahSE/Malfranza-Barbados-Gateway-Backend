import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  getAdminAvailableDrivers,
  getAdminDriverById,
  getAdminDrivers,
  patchAdminDriver,
  postAdminDriver,
} from "./driver.controller.js";

export const adminDriverRouter = Router();

adminDriverRouter.use(authenticateAdmin);
adminDriverRouter.use(requireRole("admin", "staff"));

adminDriverRouter.get("/", getAdminDrivers);
adminDriverRouter.get("/available", getAdminAvailableDrivers);
adminDriverRouter.get("/:id", getAdminDriverById);
adminDriverRouter.post("/", requireRole("admin"), postAdminDriver);
adminDriverRouter.patch("/:id", requireRole("admin"), patchAdminDriver);
