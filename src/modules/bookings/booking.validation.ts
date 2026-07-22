import { Types } from "mongoose";
import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format").refine(
  (value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  "Enter a valid date",
);

const apartmentId = z.string().refine(Types.ObjectId.isValid, "Invalid apartment ID");
const unitId = z.string().refine(Types.ObjectId.isValid, "Invalid unit ID");
const unitIds = z.array(unitId).min(1).max(20);

const dateRange = {
  apartmentId,
  unitId: unitId.optional(),
  checkIn: dateString,
  checkOut: dateString,
};

export const availabilityQuerySchema = z
  .object({
    ...dateRange,
    // Comma-separated list of unit IDs (query string friendly).
    unitIds: z
      .string()
      .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
      .pipe(unitIds)
      .optional(),
  })
  .refine(
    (input) => input.checkOut > input.checkIn,
    { message: "Check-out must be after check-in", path: ["checkOut"] },
  );

export const occupancyQuerySchema = z
  .object({
    checkIn: dateString.optional(),
    checkOut: dateString.optional(),
  })
  .refine(
    (input) => !input.checkIn || !input.checkOut || input.checkOut > input.checkIn,
    { message: "Check-out must be after check-in", path: ["checkOut"] },
  );

export const createBookingSchema = z
  .object({
    ...dateRange,
    unitIds: unitIds.optional(),
    guestName: z.string().trim().min(2).max(120),
    guestEmail: z.email().max(254),
    guestPhone: z.string().trim().min(6).max(40),
    guests: z.number().int().min(1).max(20),
    specialRequests: z.string().trim().max(2000).optional(),
    /** Demo/checkout payment — defaults to unpaid when omitted. */
    paymentStatus: z.enum(["unpaid", "paid"]).optional(),
    paymentReference: z.string().trim().min(1).max(200).optional(),
    taxi: z
      .object({
        pickup: z.string().trim().min(2).max(300),
        dropoff: z.string().trim().min(2).max(300),
        date: dateString,
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format"),
        passengers: z.number().int().min(1).max(14),
        distanceKm: z.number().nonnegative(),
        fare: z.number().nonnegative(),
        notes: z.string().trim().max(1000).optional(),
      })
      .optional(),
  })
  .refine((input) => input.checkOut > input.checkIn, {
    message: "Check-out must be after check-in",
    path: ["checkOut"],
  })
  .refine(
    (input) => input.paymentStatus !== "paid" || !!input.paymentReference,
    {
      message: "A payment reference is required when payment status is paid",
      path: ["paymentReference"],
    },
  );
export const publicBookingLookupSchema = z.object({
  reference: z.string().trim().toUpperCase().min(1).max(40),
  email: z.email().max(254),
});

export const adminBookingListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z
      .enum(["pending", "confirmed", "checked_in", "checked_out", "cancelled"])
      .optional(),
    paymentStatus: z.enum(["unpaid", "paid", "refunded"]).optional(),
    search: z.string().trim().max(120).optional(),
    fromDate: dateString.optional(),
    toDate: dateString.optional(),
  })
  .refine((input) => !input.fromDate || !input.toDate || input.toDate >= input.fromDate, {
    message: "To date must not be before from date",
    path: ["toDate"],
  });

export const bookingIdParamSchema = z.object({
  id: z.string().refine(Types.ObjectId.isValid, "Invalid booking ID"),
});

export const updateBookingStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "checked_in", "checked_out", "cancelled"]),
});

export const updatePaymentStatusSchema = z.object({
  paymentStatus: z.enum(["unpaid", "paid", "refunded"]),
  paymentReference: z.string().trim().max(200).optional(),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type OccupancyQuery = z.infer<typeof occupancyQuerySchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type AdminBookingListQuery = z.infer<typeof adminBookingListQuerySchema>;
