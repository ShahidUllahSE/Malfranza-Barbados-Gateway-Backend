import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  deleteAdminDriver,
  getAdminAvailableDrivers,
  getAdminDriverById,
  getAdminDrivers,
  patchAdminDriver,
  postAdminDriver,
} from "./driver.controller.js";

export const adminDriverRouter = Router();

adminDriverRouter.use(authenticateAdmin);
adminDriverRouter.use(requireRole("admin"));

adminDriverRouter.get("/", getAdminDrivers);
adminDriverRouter.get("/available", getAdminAvailableDrivers);
adminDriverRouter.get("/:id", getAdminDriverById);
adminDriverRouter.post("/", requireRole("admin"), postAdminDriver);
adminDriverRouter.patch("/:id", requireRole("admin"), patchAdminDriver);
adminDriverRouter.delete("/:id", requireRole("admin"), deleteAdminDriver);
