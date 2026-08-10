import type { RequestHandler } from "express";
import { z } from "zod";
import {
  capturePayPalOrder,
  createPayPalOrder,
  getPayPalPublicConfig,
} from "./paypal.service.js";

const createOrderSchema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3).optional(),
  description: z.string().trim().max(120).optional(),
});

const captureOrderSchema = z.object({
  orderId: z.string().trim().min(1),
});

export const getPayPalConfig: RequestHandler = async (_request, response) => {
  response.status(200).json({
    success: true,
    data: getPayPalPublicConfig(),
  });
};

export const createOrder: RequestHandler = async (request, response) => {
  const input = createOrderSchema.parse(request.body);
  const order = await createPayPalOrder(input);
  response.status(201).json({
    success: true,
    data: order,
  });
};

export const captureOrder: RequestHandler = async (request, response) => {
  const input = captureOrderSchema.parse(request.body);
  const capture = await capturePayPalOrder(input.orderId);
  response.status(200).json({
    success: true,
    data: capture,
  });
};
