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
});

export const env = envSchema.parse(process.env);
