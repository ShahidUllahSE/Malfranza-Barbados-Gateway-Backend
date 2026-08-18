import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  deleteEnquiry,
  getAdminEnquiries,
  getAdminEnquiry,
  patchEnquiry,
} from "./admin-enquiry.controller.js";

export const adminEnquiryRouter = Router();

adminEnquiryRouter.use(authenticateAdmin);
adminEnquiryRouter.use(requireRole("admin"));

adminEnquiryRouter.get("/", getAdminEnquiries);
adminEnquiryRouter.get("/:id", getAdminEnquiry);
adminEnquiryRouter.patch("/:id", patchEnquiry);
adminEnquiryRouter.delete("/:id", requireRole("admin"), deleteEnquiry);
