import "dotenv/config";
import { z } from "zod";

function emptyToUndefined(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value;
}

function normalizeSecret(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  // Gmail app passwords often include spaces in the Google UI copy.
  return value.replace(/\s+/g, "");
}

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
  /** Optional — when empty, emails are logged instead of sent. */
  SMTP_HOST: z.string().trim().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().trim().email().optional()),
  SMTP_PASS: z.preprocess(normalizeSecret, z.string().optional()),
  SMTP_FROM: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  EMAIL_USER: z.preprocess(emptyToUndefined, z.string().trim().email().optional()),
  EMAIL_PASS: z.preprocess(normalizeSecret, z.string().optional()),
  /** Aliases from some .env copy habits (also accepted from DEFAULT_SMTP_*). */
  DEFAULT_SMTP_EMAIL: z.preprocess(emptyToUndefined, z.string().trim().email().optional()),
  DEFAULT_SMTP_PASSWORD: z.preprocess(normalizeSecret, z.string().optional()),
  /** Where owner/admin booking & enquiry alerts are sent (defaults to SMTP user). */
  ADMIN_NOTIFY_EMAIL: z.preprocess(emptyToUndefined, z.string().trim().email().optional()),
  BEDS24_API_BASE: z.string().trim().url().default("https://api.beds24.com/v2"),
  BEDS24_REFRESH_TOKEN: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  BEDS24_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  /** sandbox | live — default sandbox for testing */
  PAYPAL_MODE: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYPAL_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  PAYPAL_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  /** Aliases some people paste from the dashboard */
  CLIENT_ID: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  SECRET_KEY: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

const parsed = envSchema.parse(process.env);

const smtpUser =
  parsed.SMTP_USER ?? parsed.EMAIL_USER ?? parsed.DEFAULT_SMTP_EMAIL;
const smtpPass =
  parsed.SMTP_PASS ?? parsed.EMAIL_PASS ?? parsed.DEFAULT_SMTP_PASSWORD;

export const env = {
  ...parsed,
  SMTP_USER: smtpUser,
  SMTP_PASS: smtpPass,
  SMTP_FROM:
    parsed.SMTP_FROM ?? (smtpUser ? `Malfranza <${smtpUser}>` : undefined),
  ADMIN_NOTIFY_EMAIL: parsed.ADMIN_NOTIFY_EMAIL ?? smtpUser,
  PAYPAL_CLIENT_ID: parsed.PAYPAL_CLIENT_ID ?? parsed.CLIENT_ID,
  PAYPAL_CLIENT_SECRET: parsed.PAYPAL_CLIENT_SECRET ?? parsed.SECRET_KEY,
};
