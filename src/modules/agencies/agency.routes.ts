import { Router } from "express";
import { authenticateAgency } from "../../middleware/agency-auth.js";
import {
  getAgencyMe,
  getAgencyMeBookings,
  getAgencyMeCommission,
  postAgencyPasswordResetConfirm,
  postAgencyPasswordResetRequest,
  postLoginAgency,
} from "./agency.controller.js";

export const agencyRouter = Router();

// No public self-registration — agencies are created by admin only.
agencyRouter.post("/login", postLoginAgency);
agencyRouter.post("/password-reset/request", postAgencyPasswordResetRequest);
agencyRouter.post("/password-reset/confirm", postAgencyPasswordResetConfirm);
agencyRouter.get("/me", authenticateAgency, getAgencyMe);
agencyRouter.get("/me/bookings", authenticateAgency, getAgencyMeBookings);
agencyRouter.get("/me/commission", authenticateAgency, getAgencyMeCommission);
