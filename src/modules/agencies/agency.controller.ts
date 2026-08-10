import type { RequestHandler } from "express";
import {
  getAgencyCommissionSummary,
  getAgencyProfile,
  listAgencyBookings,
  loginAgency,
  registerAgency,
  requestAgencyPasswordReset,
  resetAgencyPassword,
} from "./agency.service.js";
import {
  agencyPasswordResetConfirmSchema,
  agencyPasswordResetRequestSchema,
  loginAgencySchema,
  registerAgencySchema,
} from "./agency.validation.js";

export const postRegisterAgency: RequestHandler = async (request, response) => {
  const input = registerAgencySchema.parse(request.body);
  const result = await registerAgency(input);
  response.status(201).json({
    success: true,
    message: "Agency registered",
    data: result,
  });
};

export const postLoginAgency: RequestHandler = async (request, response) => {
  const input = loginAgencySchema.parse(request.body);
  const result = await loginAgency(input);
  response.status(200).json({
    success: true,
    data: result,
  });
};

export const postAgencyPasswordResetRequest: RequestHandler = async (request, response) => {
  const input = agencyPasswordResetRequestSchema.parse(request.body);
  await requestAgencyPasswordReset(input.email);
  response.status(200).json({
    success: true,
    message: "If that email is registered, a reset link has been sent.",
  });
};

export const postAgencyPasswordResetConfirm: RequestHandler = async (request, response) => {
  const input = agencyPasswordResetConfirmSchema.parse(request.body);
  await resetAgencyPassword(input.token, input.password);
  response.status(200).json({
    success: true,
    message: "Password updated. You can sign in with your new password.",
  });
};

export const getAgencyMe: RequestHandler = async (request, response) => {
  const profile = await getAgencyProfile(request.agency!.id);
  response.status(200).json({ success: true, data: profile });
};

export const getAgencyMeBookings: RequestHandler = async (request, response) => {
  const items = await listAgencyBookings(request.agency!.id);
  response.status(200).json({ success: true, data: { items } });
};

export const getAgencyMeCommission: RequestHandler = async (request, response) => {
  const summary = await getAgencyCommissionSummary(request.agency!.id);
  response.status(200).json({ success: true, data: summary });
};
