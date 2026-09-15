import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  getBeds24Bookings,
  getBeds24Health,
  getBeds24Properties,
  getBeds24Status,
  postBeds24SyncAll,
  postBeds24SyncBooking,
  postBeds24SyncExpedia,
} from "./admin-beds24.controller.js";

export const adminBeds24Router = Router();

adminBeds24Router.use(authenticateAdmin);
adminBeds24Router.use(requireRole("admin"));

adminBeds24Router.get("/status", getBeds24Status);
adminBeds24Router.get("/health", getBeds24Health);
adminBeds24Router.get("/properties", getBeds24Properties);
adminBeds24Router.get("/bookings", getBeds24Bookings);
adminBeds24Router.post("/sync/expedia", postBeds24SyncExpedia);
adminBeds24Router.post("/sync/booking", postBeds24SyncBooking);
adminBeds24Router.post("/sync", postBeds24SyncAll);
