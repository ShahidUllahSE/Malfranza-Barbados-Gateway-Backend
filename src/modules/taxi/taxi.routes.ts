import { Router } from "express";
import { authenticateUser } from "../../middleware/user-auth.js";
import { fareEstimateLimiter, publicWriteLimiter } from "../../middleware/rate-limit.js";
import {
  getTaxiBookingByReference,
  postFareEstimate,
  postTaxiBooking,
} from "./taxi.controller.js";

export const taxiRouter = Router();

taxiRouter.post("/fare-estimate", fareEstimateLimiter, postFareEstimate);
taxiRouter.post("/bookings", publicWriteLimiter, authenticateUser, postTaxiBooking);
taxiRouter.get("/bookings/:reference", getTaxiBookingByReference);
