import { Types } from "mongoose";
import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format").refine(
  (value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  "Enter a valid date",
);

export const createEnquirySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  phone: z.string().trim().max(40).optional(),
  interestedIn: z.enum(["Apartment Stay", "Taxi Service", "Both", "Other"]),
  preferredDate: dateString.optional(),
  message: z.string().trim().min(1).max(1000),
});

export const adminEnquiryListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["new", "responded", "closed"]).optional(),
    interestedIn: z.enum(["Apartment Stay", "Taxi Service", "Both", "Other"]).optional(),
    search: z.string().trim().max(120).optional(),
    fromDate: dateString.optional(),
    toDate: dateString.optional(),
  })
  .refine((input) => !input.fromDate || !input.toDate || input.toDate >= input.fromDate, {
    message: "To date must not be before from date",
    path: ["toDate"],
  });

export const enquiryIdParamSchema = z.object({
  id: z.string().refine(Types.ObjectId.isValid, "Invalid enquiry ID"),
});

export const updateEnquirySchema = z
  .object({
    status: z.enum(["new", "responded", "closed"]).optional(),
    adminNotes: z.string().trim().max(3000).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Provide a status or admin note");

export type CreateEnquiryInput = z.infer<typeof createEnquirySchema>;
export type AdminEnquiryListQuery = z.infer<typeof adminEnquiryListQuerySchema>;
export type UpdateEnquiryInput = z.infer<typeof updateEnquirySchema>;
