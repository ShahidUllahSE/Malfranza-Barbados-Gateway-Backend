import { Router } from "express";
import { createOrder, captureOrder, getPayPalConfig } from "./paypal.controller.js";

export const paymentRouter = Router();

paymentRouter.get("/paypal/config", getPayPalConfig);
paymentRouter.post("/paypal/create-order", createOrder);
paymentRouter.post("/paypal/capture-order", captureOrder);
