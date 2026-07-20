import type { RequestHandler } from "express";
import {
  cancelBooking,
  getBookingForAdmin,
  listBookings,
  updateBookingPayment,
  updateBookingStatus,
} from "./booking.service.js";
import {
  adminBookingListQuerySchema,
  bookingIdParamSchema,
  updateBookingStatusSchema,
  updatePaymentStatusSchema,
} from "./booking.validation.js";

export const getAdminBookings: RequestHandler = async (request, response) => {
  const input = adminBookingListQuerySchema.parse(request.query);
  const result = await listBookings(input);
  response.status(200).json({ success: true, data: result });
};

export const getAdminBooking: RequestHandler = async (request, response) => {
  const { id } = bookingIdParamSchema.parse(request.params);
  const booking = await getBookingForAdmin(id);
  response.status(200).json({ success: true, data: booking });
};

export const patchBookingStatus: RequestHandler = async (request, response) => {
  const { id } = bookingIdParamSchema.parse(request.params);
  const { status } = updateBookingStatusSchema.parse(request.body);
  const booking = await updateBookingStatus(id, status);
  response.status(200).json({ success: true, data: booking });
};

export const patchBookingPayment: RequestHandler = async (request, response) => {
  const { id } = bookingIdParamSchema.parse(request.params);
  const { paymentStatus, paymentReference } = updatePaymentStatusSchema.parse(request.body);
  const booking = await updateBookingPayment(id, paymentStatus, paymentReference);
  response.status(200).json({ success: true, data: booking });
};

export const deleteAdminBooking: RequestHandler = async (request, response) => {
  const { id } = bookingIdParamSchema.parse(request.params);
  const booking = await cancelBooking(id);
  response.status(200).json({
    success: true,
    message: "Booking cancelled",
    data: booking,
  });
};
