import { Types } from "mongoose";
import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format").refine(
  (value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  "Enter a valid date",
);

const routeFields = {
  pickupLocation: z.string().trim().min(2).max(300),
  dropoffLocation: z.string().trim().min(2).max(300),
  passengers: z.number().int().min(1).max(14),
};

export const fareEstimateSchema = z.object(routeFields);

export const createTaxiBookingSchema = z.object({
  ...routeFields,
  serviceType: z.enum(["Airport Pickup", "Airport Drop-off", "Point to Point", "Hourly / Custom"]),
  pickupDate: dateString,
  pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format"),
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.email().max(254),
  customerPhone: z.string().trim().min(6).max(40),
  notes: z.string().trim().max(2000).optional(),
  driverId: z.string().refine(Types.ObjectId.isValid, "Invalid driver ID").optional(),
});

export const publicVehiclesQuerySchema = z.object({
  passengers: z.coerce.number().int().min(1).max(20).default(1),
  pickupDate: dateString.optional(),
  pickupLocation: z.string().trim().min(2).max(300).optional(),
  dropoffLocation: z.string().trim().min(2).max(300).optional(),
});

export const taxiPublicLookupSchema = z.object({
  reference: z.string().trim().toUpperCase().min(1).max(40),
  email: z.email().max(254),
});

export const adminTaxiListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z
      .enum(["pending", "confirmed", "assigned", "en_route", "completed", "cancelled"])
      .optional(),
    search: z.string().trim().max(120).optional(),
    fromDate: dateString.optional(),
    toDate: dateString.optional(),
  })
  .refine((input) => !input.fromDate || !input.toDate || input.toDate >= input.fromDate, {
    message: "To date must not be before from date",
    path: ["toDate"],
  });

export const taxiIdParamSchema = z.object({
  id: z.string().refine(Types.ObjectId.isValid, "Invalid taxi booking ID"),
});

export const updateTaxiStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "assigned", "en_route", "completed", "cancelled"]),
});

export const assignTaxiDriverSchema = z.object({
  driverId: z.string().refine(Types.ObjectId.isValid, "Invalid driver ID"),
});

export const updateTaxiSettingsSchema = z.object({
  fareFor1Guest: z.number().nonnegative(),
  fareFor2Guests: z.number().nonnegative(),
  fareFor3Guests: z.number().nonnegative(),
  fareFor4PlusGuests: z.number().nonnegative(),
  perKmUsd: z.number().nonnegative(),
  minimumFareUsd: z.number().nonnegative(),
});

export type FareEstimateInput = z.infer<typeof fareEstimateSchema>;
export type CreateTaxiBookingInput = z.infer<typeof createTaxiBookingSchema>;
export type PublicVehiclesQuery = z.infer<typeof publicVehiclesQuerySchema>;
export type AdminTaxiListQuery = z.infer<typeof adminTaxiListQuerySchema>;
export type UpdateTaxiSettingsInput = z.infer<typeof updateTaxiSettingsSchema>;
