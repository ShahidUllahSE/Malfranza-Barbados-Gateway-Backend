import type { RequestHandler } from "express";
import { sendGuestCredentialsEmail } from "../notifications/email.service.js";
import { ensureGuestAccount } from "../users/user.service.js";
import {
  assignTaxiDriver,
  cancelTaxiBooking,
  createTaxiBooking,
  getTaxiBookingForAdmin,
  listTaxiBookings,
  updateTaxiBookingStatus,
} from "./taxi.service.js";
import { getTaxiSettings, updateTaxiSettings } from "./taxi-settings.service.js";
import {
  adminCreateTaxiBookingSchema,
  adminTaxiListQuerySchema,
  assignTaxiDriverSchema,
  taxiIdParamSchema,
  updateTaxiSettingsSchema,
  updateTaxiStatusSchema,
} from "./taxi.validation.js";

export const postAdminTaxiBooking: RequestHandler = async (request, response) => {
  const parsed = adminCreateTaxiBookingSchema.parse(request.body);
  const notifyGuest = parsed.notifyGuest !== false;
  const paymentStatus = parsed.paymentStatus ?? "unpaid";
  const paymentReference =
    paymentStatus === "paid"
      ? parsed.paymentReference?.trim() || "OFFLINE"
      : parsed.paymentReference?.trim() || undefined;

  const guestAccount = await ensureGuestAccount({
    name: parsed.customerName,
    email: parsed.customerEmail,
    phone: parsed.customerPhone,
  });

  const booking = await createTaxiBooking(
    {
      pickupLocation: parsed.pickupLocation,
      dropoffLocation: parsed.dropoffLocation,
      passengers: parsed.passengers,
      serviceType: parsed.serviceType,
      pickupDate: parsed.pickupDate,
      pickupTime: parsed.pickupTime,
      customerName: parsed.customerName.trim(),
      customerEmail: parsed.customerEmail.trim().toLowerCase(),
      customerPhone: parsed.customerPhone.trim(),
      notes: parsed.notes,
      paymentStatus,
      paymentReference,
      paymentMethod: parsed.paymentMethod?.trim() || "Offline",
      status: parsed.status ?? "confirmed",
    },
    guestAccount.user.id,
    { notifyGuest, source: "admin" },
  );

  if (parsed.driverId) {
    await assignTaxiDriver(String(booking._id), parsed.driverId);
  }

  if (notifyGuest && guestAccount.accountCreated && guestAccount.plainPassword) {
    void sendGuestCredentialsEmail({
      to: guestAccount.user.email,
      name: parsed.customerName.trim(),
      password: guestAccount.plainPassword,
      bookingReference: booking.bookingReference,
    }).catch((error) => {
      console.error("[email] Failed to send guest credentials", error);
    });
  }

  const full = await getTaxiBookingForAdmin(String(booking._id));
  response.status(201).json({ success: true, data: full });
};

export const getAdminTaxiBookings: RequestHandler = async (request, response) => {
  const input = adminTaxiListQuerySchema.parse(request.query);
  const result = await listTaxiBookings(input);
  response.status(200).json({ success: true, data: result });
};

export const getAdminTaxiBooking: RequestHandler = async (request, response) => {
  const { id } = taxiIdParamSchema.parse(request.params);
  const booking = await getTaxiBookingForAdmin(id);
  response.status(200).json({ success: true, data: booking });
};

export const getAdminTaxiSettings: RequestHandler = async (_request, response) => {
  const settings = await getTaxiSettings();
  response.status(200).json({ success: true, data: settings });
};

export const putAdminTaxiSettings: RequestHandler = async (request, response) => {
  const input = updateTaxiSettingsSchema.parse(request.body);
  const settings = await updateTaxiSettings(input);
  response.status(200).json({ success: true, data: settings });
};

export const patchTaxiBookingStatus: RequestHandler = async (request, response) => {
  const { id } = taxiIdParamSchema.parse(request.params);
  const { status } = updateTaxiStatusSchema.parse(request.body);
  const booking = await updateTaxiBookingStatus(id, status);
  response.status(200).json({ success: true, data: booking });
};

export const postAssignTaxiDriver: RequestHandler = async (request, response) => {
  const { id } = taxiIdParamSchema.parse(request.params);
  const { driverId } = assignTaxiDriverSchema.parse(request.body);
  const booking = await assignTaxiDriver(id, driverId);
  response.status(200).json({ success: true, data: booking });
};

export const deleteTaxiBooking: RequestHandler = async (request, response) => {
  const { id } = taxiIdParamSchema.parse(request.params);
  const booking = await cancelTaxiBooking(id);
  response.status(200).json({
    success: true,
    message: "Taxi booking cancelled",
    data: booking,
  });
};
