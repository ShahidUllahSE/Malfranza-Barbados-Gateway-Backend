import { Router } from "express";
import { authOtpLimiter } from "../../middleware/rate-limit.js";
import { authenticateUser } from "../../middleware/user-auth.js";
import {
  getMe,
  getMyBookingByReference,
  getMyBookings,
  getMyTaxiBookings,
  postLogin,
  postRegister,
  postResendSignupOtp,
  postVerifySignupOtp,
} from "./user.controller.js";

export const userRouter = Router();

userRouter.post("/register", authOtpLimiter, postRegister);
userRouter.post("/register/verify-otp", authOtpLimiter, postVerifySignupOtp);
userRouter.post("/register/resend-otp", authOtpLimiter, postResendSignupOtp);
userRouter.post("/login", postLogin);
userRouter.get("/me", authenticateUser, getMe);
userRouter.get("/me/bookings", authenticateUser, getMyBookings);
userRouter.get("/me/bookings/:reference", authenticateUser, getMyBookingByReference);
userRouter.get("/me/taxi", authenticateUser, getMyTaxiBookings);
