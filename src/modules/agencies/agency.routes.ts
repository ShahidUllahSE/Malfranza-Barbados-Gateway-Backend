import { Router } from "express";
import { authenticateAgency } from "../../middleware/agency-auth.js";
import { authOtpLimiter } from "../../middleware/rate-limit.js";
import {
  getAgencyMe,
  getAgencyMeBookings,
  getAgencyMeCommission,
  getPublicAgencyCommissionRate,
  postAgencyPasswordResetConfirm,
  postAgencyPasswordResetRequest,
  postLoginAgency,
  postRegisterAgency,
  postResendAgencySignupOtp,
  postVerifyAgencySignupOtp,
} from "./agency.controller.js";

export const agencyRouter = Router();

agencyRouter.get("/commission-rate", getPublicAgencyCommissionRate);
agencyRouter.post("/register", authOtpLimiter, postRegisterAgency);
agencyRouter.post("/register/verify-otp", authOtpLimiter, postVerifyAgencySignupOtp);
agencyRouter.post("/register/resend-otp", authOtpLimiter, postResendAgencySignupOtp);
agencyRouter.post("/login", postLoginAgency);
agencyRouter.post("/password-reset/request", postAgencyPasswordResetRequest);
agencyRouter.post("/password-reset/confirm", postAgencyPasswordResetConfirm);
agencyRouter.get("/me", authenticateAgency, getAgencyMe);
agencyRouter.get("/me/bookings", authenticateAgency, getAgencyMeBookings);
agencyRouter.get("/me/commission", authenticateAgency, getAgencyMeCommission);
