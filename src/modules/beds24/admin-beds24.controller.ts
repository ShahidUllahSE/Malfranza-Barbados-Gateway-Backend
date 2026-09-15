import type { RequestHandler } from "express";
import {
  syncAllBeds24OtaBookings,
  syncBookingComBookings,
  syncExpediaBookings,
} from "./beds24-sync.service.js";
import {
  beds24Status,
  listBeds24Bookings,
  listBeds24Properties,
  probeBeds24Health,
} from "./beds24.service.js";

export const getBeds24Status: RequestHandler = async (_request, response) => {
  response.status(200).json({
    success: true,
    data: beds24Status(),
  });
};

export const getBeds24Health: RequestHandler = async (_request, response) => {
  const data = await probeBeds24Health();
  response.status(200).json({
    success: true,
    data,
  });
};

export const getBeds24Properties: RequestHandler = async (_request, response) => {
  const data = await listBeds24Properties();
  response.status(200).json({
    success: true,
    data,
  });
};

export const getBeds24Bookings: RequestHandler = async (request, response) => {
  const channel =
    typeof request.query.channel === "string" ? request.query.channel : undefined;
  const data = await listBeds24Bookings(channel);
  response.status(200).json({
    success: true,
    data,
  });
};

export const postBeds24SyncExpedia: RequestHandler = async (_request, response) => {
  const data = await syncExpediaBookings();
  response.status(200).json({
    success: true,
    data,
  });
};

export const postBeds24SyncBooking: RequestHandler = async (_request, response) => {
  const data = await syncBookingComBookings();
  response.status(200).json({
    success: true,
    data,
  });
};

export const postBeds24SyncAll: RequestHandler = async (_request, response) => {
  const data = await syncAllBeds24OtaBookings();
  response.status(200).json({
    success: true,
    data,
  });
};
