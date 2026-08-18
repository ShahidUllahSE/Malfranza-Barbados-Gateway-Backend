import type { RequestHandler } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import {
  createAdminAccount,
  listAdminAccounts,
  setAdminAccountActive,
} from "./auth.service.js";
import { createAdminAccountSchema } from "./auth.validation.js";

export const getAdminAccounts: RequestHandler = async (_request, response) => {
  const items = await listAdminAccounts();
  response.status(200).json({ success: true, data: { items } });
};

export const postAdminAccount: RequestHandler = async (request, response) => {
  const input = createAdminAccountSchema.parse(request.body);
  const admin = await createAdminAccount(input);
  response.status(201).json({
    success: true,
    message: "Admin account created",
    data: { admin },
  });
};

export const patchAdminAccountActive: RequestHandler = async (request, response) => {
  const { id } = z
    .object({ id: z.string().refine(Types.ObjectId.isValid, "Invalid admin ID") })
    .parse(request.params);
  const { isActive } = z.object({ isActive: z.boolean() }).parse(request.body);
  const result = await setAdminAccountActive(id, isActive, request.admin!.id);
  response.status(200).json({ success: true, data: result });
};
