import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  deleteApartment,
  getAdminApartmentById,
  getAdminApartments,
  patchApartment,
  postApartment,
} from "./admin-apartment.controller.js";

export const adminApartmentRouter = Router();

adminApartmentRouter.use(authenticateAdmin);
adminApartmentRouter.use(requireRole("admin", "staff"));

adminApartmentRouter.get("/", getAdminApartments);
adminApartmentRouter.get("/:id", getAdminApartmentById);
adminApartmentRouter.post("/", requireRole("admin"), postApartment);
adminApartmentRouter.patch("/:id", patchApartment);
adminApartmentRouter.delete("/:id", requireRole("admin"), deleteApartment);
