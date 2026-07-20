import type { RequestHandler } from "express";
import { bootstrapAdmin, login, loginSession } from "./auth.service.js";
import { bootstrapAdminSchema, loginSchema } from "./auth.validation.js";

export const postBootstrapAdmin: RequestHandler = async (request, response) => {
  const input = bootstrapAdminSchema.parse(request.body);
  const result = await bootstrapAdmin(input);

  response.status(201).json({
    success: true,
    data: result,
  });
};

export const postLogin: RequestHandler = async (request, response) => {
  const input = loginSchema.parse(request.body);
  const result = await login(input);

  response.status(200).json({
    success: true,
    data: result,
  });
};

/** Unified guest + staff sign-in. Returns kind/role so the client can route. */
export const postSession: RequestHandler = async (request, response) => {
  const input = loginSchema.parse(request.body);
  const result = await loginSession(input);

  response.status(200).json({
    success: true,
    data: result,
  });
};

export const getCurrentAdmin: RequestHandler = (request, response) => {
  response.status(200).json({
    success: true,
    data: request.admin,
  });
};
