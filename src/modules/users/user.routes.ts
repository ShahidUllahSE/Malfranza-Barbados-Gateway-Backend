import { Router } from "express";
import { authenticateUser } from "../../middleware/user-auth.js";
import {
  getMe,
  getMyBookingByReference,
  getMyBookings,
  getMyTaxiBookings,
  postLogin,
  postRegister,
} from "./user.controller.js";

export const userRouter = Router();

userRouter.post("/register", postRegister);
userRouter.post("/login", postLogin);
userRouter.get("/me", authenticateUser, getMe);
userRouter.get("/me/bookings", authenticateUser, getMyBookings);
userRouter.get("/me/bookings/:reference", authenticateUser, getMyBookingByReference);
userRouter.get("/me/taxi", authenticateUser, getMyTaxiBookings);
