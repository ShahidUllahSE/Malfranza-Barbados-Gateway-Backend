import type { RequestHandler } from "express";
import {
  beds24Status,
  listBeds24Bookings,
  listBeds24Properties,
} from "./beds24.service.js";

export const getBeds24Status: RequestHandler = async (_request, response) => {
  response.status(200).json({
    success: true,
    data: beds24Status(),
  });
};

export const getBeds24Properties: RequestHandler = async (_request, response) => {
  const data = await listBeds24Properties();
  response.status(200).json({
    success: true,
    data,
  });
};

export const getBeds24Bookings: RequestHandler = async (_request, response) => {
  const data = await listBeds24Bookings();
  response.status(200).json({
    success: true,
    data,
  });
};
