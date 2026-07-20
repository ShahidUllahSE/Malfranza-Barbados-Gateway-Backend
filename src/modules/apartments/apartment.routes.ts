import { Router } from "express";
import {
  getApartmentBySlug,
  getApartments,
} from "./apartment.controller.js";

export const apartmentRouter = Router();

apartmentRouter.get("/", getApartments);
apartmentRouter.get("/:slug", getApartmentBySlug);
