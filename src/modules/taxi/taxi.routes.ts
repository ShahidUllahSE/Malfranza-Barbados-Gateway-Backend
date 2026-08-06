import { Router } from "express";
import { optionalAuthenticateUser } from "../../middleware/user-auth.js";
import { fareEstimateLimiter, publicWriteLimiter } from "../../middleware/rate-limit.js";
import {
  getPublicTaxiSettings,
  getTaxiBookingByReference,
  postFareEstimate,
  postTaxiBooking,
} from "./taxi.controller.js";

export const taxiRouter = Router();

taxiRouter.get("/fare-settings", getPublicTaxiSettings);
taxiRouter.post("/fare-estimate", fareEstimateLimiter, postFareEstimate);
taxiRouter.post("/bookings", publicWriteLimiter, optionalAuthenticateUser, postTaxiBooking);
taxiRouter.get("/bookings/:reference", getTaxiBookingByReference);
