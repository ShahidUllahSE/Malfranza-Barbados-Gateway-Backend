import { Router } from "express";
import { optionalAuthenticateUser } from "../../middleware/user-auth.js";
import {
  getAvailability,
  getBookingByReference,
  getOccupancy,
  postBooking,
} from "./booking.controller.js";

export const bookingRouter = Router();

bookingRouter.get("/availability", getAvailability);
bookingRouter.get("/occupancy", getOccupancy);
bookingRouter.post("/", optionalAuthenticateUser, postBooking);
bookingRouter.get("/:reference", getBookingByReference);
