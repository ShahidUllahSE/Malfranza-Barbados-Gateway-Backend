import type { RequestHandler } from "express";
import { AppError } from "./error-handler.js";
import { verifyAgencyToken } from "../modules/agencies/agency.service.js";

export const authenticateAgency: RequestHandler = async (request, _response, next) => {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError(401, "Agency sign in required");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new AppError(401, "Agency sign in required");
  }

  request.agency = await verifyAgencyToken(token);
  next();
};
