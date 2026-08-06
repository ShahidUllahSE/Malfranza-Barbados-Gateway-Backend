import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  FRONTEND_URL: z.string().url().default("http://localhost:8081"),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(86400),
  ADMIN_BOOTSTRAP_KEY: z.string().min(32),
  GOOGLE_MAPS_API_KEY: z.string().trim().min(1).optional(),
  TAXI_BASE_FARE_USD: z.coerce.number().nonnegative().default(15),
  TAXI_PER_KM_USD: z.coerce.number().nonnegative().default(2.5),
  TAXI_MINIMUM_FARE_USD: z.coerce.number().nonnegative().default(20),
  TAXI_EXTRA_PASSENGER_USD: z.coerce.number().nonnegative().default(5),
  CLOUDINARY_CLOUD_NAME: z.string().trim().min(1),
  CLOUDINARY_API_KEY: z.string().trim().min(1),
  CLOUDINARY_API_SECRET: z.string().trim().min(1),
  /** Optional — when empty, guest credential emails are logged instead of sent. */
  SMTP_HOST: z.string().trim().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  SMTP_USER: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().email().optional(),
  ),
  SMTP_PASS: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().optional(),
  ),
  SMTP_FROM: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional(),
  ),
  /** Beds24 API v2 — prefer refresh token; access token is short-lived. */
  BEDS24_API_BASE: z.string().trim().url().default("https://api.beds24.com/v2"),
  BEDS24_REFRESH_TOKEN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional(),
  ),
  BEDS24_ACCESS_TOKEN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional(),
  ),
});

export const env = envSchema.parse(process.env);
