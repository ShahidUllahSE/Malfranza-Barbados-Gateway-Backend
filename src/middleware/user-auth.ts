import type { RequestHandler } from "express";
import { AppError } from "./error-handler.js";
import { verifyUserToken } from "../modules/users/user.service.js";

export const authenticateUser: RequestHandler = async (request, _response, next) => {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError(401, "Sign in required");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new AppError(401, "Sign in required");
  }

  request.user = await verifyUserToken(token);
  next();
};

export const optionalAuthenticateUser: RequestHandler = async (request, _response, next) => {
  const authorization = request.header("authorization");

  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token) {
      try {
        request.user = await verifyUserToken(token);
      } catch {
        // Ignore invalid guest tokens on public booking endpoints.
      }
    }
  }

  next();
};
