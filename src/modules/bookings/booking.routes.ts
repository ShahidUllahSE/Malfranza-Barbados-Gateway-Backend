import { Router } from "express";
import { authenticateUser } from "../../middleware/user-auth.js";
import {
  getAvailability,
  getBookingByReference,
  getOccupancy,
  postBooking,
} from "./booking.controller.js";

export const bookingRouter = Router();

bookingRouter.get("/availability", getAvailability);
bookingRouter.get("/occupancy", getOccupancy);
bookingRouter.post("/", authenticateUser, postBooking);
bookingRouter.get("/:reference", getBookingByReference);
