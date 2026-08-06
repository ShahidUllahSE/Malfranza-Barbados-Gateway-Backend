import { Router } from "express";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import {
  getBeds24Bookings,
  getBeds24Properties,
  getBeds24Status,
} from "./admin-beds24.controller.js";

export const adminBeds24Router = Router();

adminBeds24Router.use(authenticateAdmin);
adminBeds24Router.use(requireRole("admin", "staff"));

adminBeds24Router.get("/status", getBeds24Status);
adminBeds24Router.get("/properties", getBeds24Properties);
adminBeds24Router.get("/bookings", getBeds24Bookings);
