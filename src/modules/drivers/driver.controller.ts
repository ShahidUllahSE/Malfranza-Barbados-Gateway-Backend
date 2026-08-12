import type { RequestHandler } from "express";
import {
  createDriver,
  deleteDriver,
  getAdminDriverDetail,
  listAvailableDrivers,
  listDrivers,
  setDriverAvailability,
  updateDriver,
  verifyDriverToken,
  listDriverTrips,
  loginDriver,
} from "./driver.service.js";
import {
  adminDriverDetailQuerySchema,
  adminDriverListQuerySchema,
  createDriverSchema,
  driverAvailabilitySchema,
  driverIdParamSchema,
  driverLoginSchema,
  updateDriverSchema,
} from "./driver.validation.js";
import {
  busyDriverIdsForSlot,
  updateDriverTaxiStatus,
  type DriverTaxiStatus,
} from "../taxi/taxi.service.js";
import { z } from "zod";

export const postAdminDriver: RequestHandler = async (request, response) => {
  const input = createDriverSchema.parse(request.body);
  const driver = await createDriver(input);
  response.status(201).json({ success: true, data: driver });
};

export const getAdminDrivers: RequestHandler = async (request, response) => {
  const input = adminDriverListQuerySchema.parse(request.query);
  const result = await listDrivers(input);
  response.status(200).json({ success: true, data: result });
};

export const getAdminAvailableDrivers: RequestHandler = async (request, response) => {
  const items = await listAvailableDrivers();
  const pickupDate =
    typeof request.query.pickupDate === "string" ? request.query.pickupDate : "";
  const pickupTime =
    typeof request.query.pickupTime === "string" ? request.query.pickupTime : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) && /^([01]\d|2[0-3]):[0-5]\d$/.test(pickupTime)) {
    const busy = await busyDriverIdsForSlot(new Date(`${pickupDate}T00:00:00.000Z`), pickupTime);
    const busySet = new Set(busy.ids);
    response.status(200).json({
      success: true,
      data: { items: items.filter((driver) => !busySet.has(driver.id)) },
    });
    return;
  }
  response.status(200).json({ success: true, data: { items } });
};

export const getAdminDriverById: RequestHandler = async (request, response) => {
  const { id } = driverIdParamSchema.parse(request.params);
  const query = adminDriverDetailQuerySchema.parse(request.query);
  const data = await getAdminDriverDetail(id, query);
  response.status(200).json({ success: true, data });
};

export const patchAdminDriver: RequestHandler = async (request, response) => {
  const { id } = driverIdParamSchema.parse(request.params);
  const input = updateDriverSchema.parse(request.body);
  const driver = await updateDriver(id, input);
  response.status(200).json({ success: true, data: driver });
};

export const deleteAdminDriver: RequestHandler = async (request, response) => {
  const { id } = driverIdParamSchema.parse(request.params);
  const result = await deleteDriver(id);
  response.status(200).json({
    success: true,
    message: "Driver deleted",
    data: result,
  });
};

export const postDriverLogin: RequestHandler = async (request, response) => {
  const input = driverLoginSchema.parse(request.body);
  const result = await loginDriver(input);
  response.status(200).json({ success: true, data: result });
};

export const getDriverMe: RequestHandler = (request, response) => {
  response.status(200).json({ success: true, data: request.driver });
};

export const patchDriverAvailability: RequestHandler = async (request, response) => {
  const input = driverAvailabilitySchema.parse(request.body);
  const driver = await setDriverAvailability(request.driver!.id, input.isAvailable);
  response.status(200).json({ success: true, data: driver });
};

export const getDriverTrips: RequestHandler = async (request, response) => {
  const items = await listDriverTrips(request.driver!.id);
  response.status(200).json({ success: true, data: { items } });
};

const driverTripStatusSchema = z.object({
  status: z.enum(["en_route", "completed", "cancelled"]),
});

export const patchDriverTripStatus: RequestHandler = async (request, response) => {
  const { id } = driverIdParamSchema.parse(request.params);
  const { status } = driverTripStatusSchema.parse(request.body);
  const booking = await updateDriverTaxiStatus(
    id,
    request.driver!.id,
    status as DriverTaxiStatus,
  );
  response.status(200).json({ success: true, data: booking });
};

/** Middleware-style helper used by routes — re-export verify for auth middleware */
export { verifyDriverToken };
