import type { RequestHandler } from "express";
import {
  adminCommissionReport,
  createAgencyByAdmin,
  listAgenciesAdmin,
  setAgencyActive,
} from "./agency.service.js";
import {
  getAgencyCommissionSettings,
  updateAgencyCommissionSettings,
} from "./agency-settings.service.js";
import { agencyCommissionQuerySchema, registerAgencySchema } from "./agency.validation.js";
import { z } from "zod";
import { Types } from "mongoose";

export const getAdminAgencies: RequestHandler = async (_request, response) => {
  const items = await listAgenciesAdmin();
  response.status(200).json({ success: true, data: { items } });
};

export const postAdminCreateAgency: RequestHandler = async (request, response) => {
  const input = registerAgencySchema.parse(request.body);
  const result = await createAgencyByAdmin(input);
  response.status(201).json({
    success: true,
    message: "Travel agency created",
    data: result,
  });
};

export const getAdminAgencyCommission: RequestHandler = async (request, response) => {
  const query = agencyCommissionQuerySchema.parse(request.query);
  const report = await adminCommissionReport(query);
  response.status(200).json({ success: true, data: report });
};

export const getAdminAgencySettings: RequestHandler = async (_request, response) => {
  const settings = await getAgencyCommissionSettings();
  response.status(200).json({ success: true, data: settings });
};

export const patchAdminAgencySettings: RequestHandler = async (request, response) => {
  const input = z
    .object({
      defaultCommissionPercent: z.number().min(0).max(100).optional(),
      defaultCommissionRate: z.number().min(0).max(1).optional(),
      applyToAllAgencies: z.boolean().optional(),
    })
    .refine(
      (v) => v.defaultCommissionPercent != null || v.defaultCommissionRate != null,
      { message: "Provide defaultCommissionPercent or defaultCommissionRate" },
    )
    .parse(request.body);

  const settings = await updateAgencyCommissionSettings(input);
  response.status(200).json({
    success: true,
    message: "Travel agent commission rate updated",
    data: settings,
  });
};

export const patchAdminAgencyActive: RequestHandler = async (request, response) => {
  const { id } = z
    .object({ id: z.string().refine(Types.ObjectId.isValid, "Invalid agency ID") })
    .parse(request.params);
  const { isActive } = z.object({ isActive: z.boolean() }).parse(request.body);
  const result = await setAgencyActive(id, isActive);
  response.status(200).json({ success: true, data: result });
};
