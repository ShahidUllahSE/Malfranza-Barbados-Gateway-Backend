import type { RequestHandler } from "express";
import { AppError } from "./error-handler.js";
import { verifyDriverToken } from "../modules/drivers/driver.service.js";

export const authenticateDriver: RequestHandler = async (request, _response, next) => {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError(401, "Driver authentication required");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new AppError(401, "Driver authentication required");
  }

  request.driver = await verifyDriverToken(token);
  next();
};
