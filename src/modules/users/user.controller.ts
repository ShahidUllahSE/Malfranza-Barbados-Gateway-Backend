import type { RequestHandler } from "express";
import {
  getUserBookingByReference,
  getUserProfile,
  listUserBookings,
  listUserTaxiBookings,
  loginUser,
  resendSignupOtp,
  startSignupWithOtp,
  verifySignupOtp,
} from "./user.service.js";
import {
  loginUserSchema,
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
