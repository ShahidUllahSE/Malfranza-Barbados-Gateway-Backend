import type { RequestHandler } from "express";
import { cancelUserStayBooking, submitStayRefundRequest } from "../bookings/booking.service.js";
import { guestCancelBookingSchema, guestRefundRequestSchema } from "../bookings/cancellation.js";
import { cancelUserTaxiBooking, submitTaxiRefundRequest } from "../taxi/taxi.service.js";
import {
  getUserBookingByReference,
  getUserProfile,
  listUserBookings,
  listUserTaxiBookings,
  loginUser,
  registerCheckoutAccount,
  requestUserPasswordReset,
  resendSignupOtp,
  resetUserPassword,
  startSignupWithOtp,
  verifySignupOtp,
} from "./user.service.js";
import {
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
} from "../notifications/user-notification.service.js";
import {
  loginUserSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerUserSchema,
  resendSignupOtpSchema,
  verifySignupOtpSchema,
} from "./user.validation.js";

/** Start signup — send email OTP (account not created yet). */
export const postRegister: RequestHandler = async (request, response) => {
  const input = registerUserSchema.parse(request.body);
  const result = await startSignupWithOtp(input);
  response.status(200).json({ success: true, data: result });
};

/** Checkout signup — create account with chosen password and return a session token. */
export const postRegisterCheckout: RequestHandler = async (request, response) => {
  const input = registerUserSchema.parse(request.body);
  const result = await registerCheckoutAccount(input);
  response.status(201).json({ success: true, data: result });
};

export const postVerifySignupOtp: RequestHandler = async (request, response) => {
  const input = verifySignupOtpSchema.parse(request.body);
  const result = await verifySignupOtp(input);
  response.status(201).json({ success: true, data: result });
};

export const postResendSignupOtp: RequestHandler = async (request, response) => {
  const input = resendSignupOtpSchema.parse(request.body);
  const result = await resendSignupOtp(input);
  response.status(200).json({ success: true, data: result });
};

export const postLogin: RequestHandler = async (request, response) => {
  const input = loginUserSchema.parse(request.body);
  const result = await loginUser(input);
  response.status(200).json({ success: true, data: result });
};

export const postPasswordResetRequest: RequestHandler = async (request, response) => {
  const input = passwordResetRequestSchema.parse(request.body);
  await requestUserPasswordReset(input.email);
  response.status(200).json({
    success: true,
    message: "If that email is registered, a reset link has been sent.",
  });
};

export const postPasswordResetConfirm: RequestHandler = async (request, response) => {
  const input = passwordResetConfirmSchema.parse(request.body);
  await resetUserPassword(input.token, input.password);
  response.status(200).json({
    success: true,
    message: "Password updated. You can sign in with your new password.",
  });
};

export const getMe: RequestHandler = async (request, response) => {
  const profile = await getUserProfile(request.user!.id);
  response.status(200).json({ success: true, data: profile });
};

export const getMyBookings: RequestHandler = async (request, response) => {
  const items = await listUserBookings(request.user!.id);
  response.status(200).json({ success: true, data: { items } });
};

export const getMyBookingByReference: RequestHandler = async (request, response) => {
  const reference = String(request.params.reference ?? "");
  const booking = await getUserBookingByReference(request.user!.id, reference);
  response.status(200).json({ success: true, data: booking });
};

export const getMyTaxiBookings: RequestHandler = async (request, response) => {
  const items = await listUserTaxiBookings(request.user!.id);
  response.status(200).json({ success: true, data: { items } });
};

export const postCancelMyBooking: RequestHandler = async (request, response) => {
  const input = guestCancelBookingSchema.parse(request.body ?? {});
  const booking = await cancelUserStayBooking(
    request.user!.id,
    String(request.params.reference ?? ""),
    input,
  );
  response.status(200).json({ success: true, data: booking });
};

export const postCancelMyTaxiBooking: RequestHandler = async (request, response) => {
  const input = guestCancelBookingSchema.parse(request.body ?? {});
  const booking = await cancelUserTaxiBooking(
    request.user!.id,
    String(request.params.reference ?? ""),
    input,
  );
  response.status(200).json({ success: true, data: booking });
};

export const postMyStayRefundRequest: RequestHandler = async (request, response) => {
  const input = guestRefundRequestSchema.parse(request.body ?? {});
  const booking = await submitStayRefundRequest(
    request.user!.id,
    String(request.params.reference ?? ""),
    input,
  );
  response.status(200).json({ success: true, data: booking });
};

export const postMyTaxiRefundRequest: RequestHandler = async (request, response) => {
  const input = guestRefundRequestSchema.parse(request.body ?? {});
  const booking = await submitTaxiRefundRequest(
    request.user!.id,
    String(request.params.reference ?? ""),
    input,
  );
  response.status(200).json({ success: true, data: booking });
};

export const getMyNotifications: RequestHandler = async (request, response) => {
  const limit = request.query.limit ? Number(request.query.limit) : undefined;
  const data = await listUserNotifications(request.user!.id, { limit });
  response.status(200).json({ success: true, data });
};

export const patchMyNotificationRead: RequestHandler = async (request, response) => {
  const data = await markUserNotificationRead(request.user!.id, String(request.params.id));
  response.status(200).json({ success: true, data });
};

export const postMyNotificationsReadAll: RequestHandler = async (request, response) => {
  const data = await markAllUserNotificationsRead(request.user!.id);
  response.status(200).json({ success: true, data });
};
