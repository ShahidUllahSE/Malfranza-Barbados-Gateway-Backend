import { Router } from "express";
import { authenticateDriver } from "../../middleware/driver-auth.js";
import {
  getDriverMe,
  getDriverTrips,
  patchDriverAvailability,
  patchDriverTripStatus,
  postDriverLogin,
} from "./driver.controller.js";

export const driverRouter = Router();

driverRouter.post("/login", postDriverLogin);
driverRouter.get("/me", authenticateDriver, getDriverMe);
driverRouter.patch("/me/availability", authenticateDriver, patchDriverAvailability);
driverRouter.get("/me/trips", authenticateDriver, getDriverTrips);
driverRouter.patch("/me/trips/:id/status", authenticateDriver, patchDriverTripStatus);
