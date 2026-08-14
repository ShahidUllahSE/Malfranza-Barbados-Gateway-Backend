import { Router } from "express";
import { authOtpLimiter } from "../../middleware/rate-limit.js";
import { authenticateUser } from "../../middleware/user-auth.js";
import {
  getMe,
  getMyBookingByReference,
  getMyBookings,
  getMyNotifications,
  getMyTaxiBookings,
  patchMyNotificationRead,
  postCancelMyBooking,
  postCancelMyTaxiBooking,
  postLogin,
  postMyNotificationsReadAll,
  postMyStayRefundRequest,
  postMyTaxiRefundRequest,
  postPasswordResetConfirm,
  postPasswordResetRequest,
  postRegister,
  postRegisterCheckout,
  postResendSignupOtp,
  postVerifySignupOtp,
} from "./user.controller.js";

export const userRouter = Router();

userRouter.post("/register", authOtpLimiter, postRegister);
userRouter.post("/register/checkout", authOtpLimiter, postRegisterCheckout);
userRouter.post("/register/verify-otp", authOtpLimiter, postVerifySignupOtp);
userRouter.post("/register/resend-otp", authOtpLimiter, postResendSignupOtp);
userRouter.post("/login", postLogin);
userRouter.post("/password-reset/request", authOtpLimiter, postPasswordResetRequest);
userRouter.post("/password-reset/confirm", authOtpLimiter, postPasswordResetConfirm);
userRouter.get("/me", authenticateUser, getMe);
userRouter.get("/me/bookings", authenticateUser, getMyBookings);
userRouter.get("/me/bookings/:reference", authenticateUser, getMyBookingByReference);
userRouter.post("/me/bookings/:reference/cancel", authenticateUser, postCancelMyBooking);
userRouter.post("/me/bookings/:reference/refund-request", authenticateUser, postMyStayRefundRequest);
userRouter.get("/me/taxi", authenticateUser, getMyTaxiBookings);
userRouter.post("/me/taxi/:reference/cancel", authenticateUser, postCancelMyTaxiBooking);
userRouter.post("/me/taxi/:reference/refund-request", authenticateUser, postMyTaxiRefundRequest);
userRouter.get("/me/notifications", authenticateUser, getMyNotifications);
userRouter.patch("/me/notifications/:id/read", authenticateUser, patchMyNotificationRead);
userRouter.post("/me/notifications/read-all", authenticateUser, postMyNotificationsReadAll);
