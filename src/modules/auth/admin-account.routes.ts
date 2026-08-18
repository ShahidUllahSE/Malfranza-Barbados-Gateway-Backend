import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  getAdminAccounts,
  patchAdminAccountActive,
  postAdminAccount,
} from "./admin-account.controller.js";

export const adminAccountRouter = Router();

adminAccountRouter.use(authenticateAdmin, requireRole("admin"));
adminAccountRouter.get("/", getAdminAccounts);
adminAccountRouter.post("/", postAdminAccount);
adminAccountRouter.patch("/:id/active", patchAdminAccountActive);
