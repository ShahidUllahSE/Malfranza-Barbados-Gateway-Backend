import { z } from "zod";
import { Types } from "mongoose";

const credentials = {
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
};

export const createDriverSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  vehicleLabel: z.string().trim().max(120).optional(),
  isAvailable: z.boolean().optional(),
  ...credentials,
});

export const updateDriverSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(6).max(40).optional(),
    vehicleLabel: z.string().trim().max(120).nullable().optional(),
    password: z.string().min(8).max(128).optional(),
    isAvailable: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Provide at least one field to update");

export const driverLoginSchema = z.object(credentials);

export const driverAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export const driverIdParamSchema = z.object({
  id: z.string().refine(Types.ObjectId.isValid, "Invalid driver ID"),
});

export const adminDriverListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(120).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  isAvailable: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional();

export const adminDriverDetailQuerySchema = z.object({
  status: z
    .enum(["all", "assigned", "en_route", "completed", "cancelled"])
    .default("all"),
  day: z.enum(["all", "today", "yesterday", "week", "month"]).default("all"),
  fromDate: dateOnly,
  toDate: dateOnly,
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type CreateDriverInput = z.infer<typeof createDriverSchema>;
export type UpdateDriverInput = z.infer<typeof updateDriverSchema>;
export type DriverLoginInput = z.infer<typeof driverLoginSchema>;
export type AdminDriverListQuery = z.infer<typeof adminDriverListQuerySchema>;
export type AdminDriverDetailQuery = z.infer<typeof adminDriverDetailQuerySchema>;
