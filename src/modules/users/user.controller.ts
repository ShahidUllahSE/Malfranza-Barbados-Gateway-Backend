import type { RequestHandler } from "express";
import {
  getUserBookingByReference,
  getUserProfile,
  listUserBookings,
  listUserTaxiBookings,
  loginUser,
  registerUser,
} from "./user.service.js";
import { loginUserSchema, registerUserSchema } from "./user.validation.js";

export const postRegister: RequestHandler = async (request, response) => {
  const input = registerUserSchema.parse(request.body);
  const result = await registerUser(input);
  response.status(201).json({ success: true, data: result });
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
