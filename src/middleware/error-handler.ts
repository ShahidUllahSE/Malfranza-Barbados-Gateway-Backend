import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    response.status(400).json({
      success: false,
      message: error.code === "LIMIT_FILE_SIZE" ? "Image must be 8 MB or smaller" : error.message,
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const message = error instanceof AppError ? error.message : "Internal server error";

  if (statusCode === 500) {
    console.error(error);
  }

  response.status(statusCode).json({
    success: false,
    message,
  });
};
