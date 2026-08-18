import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  deleteAdminUser,
  getAdminUsers,
  patchAdminUserActive,
  restoreAdminUser,
} from "./admin-user.controller.js";

export const adminUserRouter = Router();

adminUserRouter.use(authenticateAdmin, requireRole("admin"));
adminUserRouter.get("/", getAdminUsers);
adminUserRouter.patch("/:kind/:id/active", patchAdminUserActive);
adminUserRouter.patch("/:kind/:id/restore", restoreAdminUser);
adminUserRouter.delete("/:kind/:id", deleteAdminUser);
