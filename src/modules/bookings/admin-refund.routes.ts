import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import { getAdminRefunds, patchAdminRefund } from "./admin-refund.controller.js";

export const adminRefundRouter = Router();

adminRefundRouter.use(authenticateAdmin);
adminRefundRouter.use(requireRole("admin", "staff"));

adminRefundRouter.get("/", getAdminRefunds);
adminRefundRouter.patch("/:kind/:id", requireRole("admin"), patchAdminRefund);
