import type { RequestHandler } from "express";
import {
  assignTaxiDriver,
  cancelTaxiBooking,
  getTaxiBookingForAdmin,
  listTaxiBookings,
  updateTaxiBookingStatus,
} from "./taxi.service.js";
import { getTaxiSettings, updateTaxiSettings } from "./taxi-settings.service.js";
import {
  adminTaxiListQuerySchema,
  assignTaxiDriverSchema,
  taxiIdParamSchema,
  updateTaxiSettingsSchema,
  updateTaxiStatusSchema,
} from "./taxi.validation.js";

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
