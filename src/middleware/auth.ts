import type { RequestHandler } from "express";
import { AppError } from "./error-handler.js";
import { verifyAdminToken, type AuthenticatedAdmin } from "../modules/auth/auth.service.js";

export const authenticateAdmin: RequestHandler = async (request, _response, next) => {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError(401, "Admin authentication required");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new AppError(401, "Admin authentication required");
  }

  request.admin = await verifyAdminToken(token);
  next();
};

export function requireRole(...roles: AuthenticatedAdmin["role"][]): RequestHandler {
  return (request, _response, next) => {
    if (!request.admin || !roles.includes(request.admin.role)) {
      throw new AppError(403, "You do not have permission to perform this action");
    }
    next();
  };
}
