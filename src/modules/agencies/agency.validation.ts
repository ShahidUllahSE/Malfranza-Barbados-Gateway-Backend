import { z } from "zod";

const credentials = {
  email: z.email().max(254),
  password: z.string().min(8).max(128),
};

export const registerAgencySchema = z.object({
  agencyName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(6).max(40),
  password: z.string().min(8).max(128),
});

export const verifyAgencySignupOtpSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});

export const resendAgencySignupOtpSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
});

export const loginAgencySchema = z.object(credentials);

export const agencyPasswordResetRequestSchema = z.object({
  email: z.email().max(254),
});

export const agencyPasswordResetConfirmSchema = z.object({
  token: z.string().min(20).max(2000),
  password: z.string().min(8).max(128),
});

export const agencyCommissionQuerySchema = z
  .object({
    fromDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    toDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    agencyCode: z.string().trim().toUpperCase().max(40).optional(),
  })
  .refine((input) => !input.fromDate || !input.toDate || input.toDate >= input.fromDate, {
    message: "To date must not be before from date",
    path: ["toDate"],
  });

export type RegisterAgencyInput = z.infer<typeof registerAgencySchema>;
export type LoginAgencyInput = z.infer<typeof loginAgencySchema>;
export type AgencyCommissionQuery = z.infer<typeof agencyCommissionQuerySchema>;
export type VerifyAgencySignupOtpInput = z.infer<typeof verifyAgencySignupOtpSchema>;
export type ResendAgencySignupOtpInput = z.infer<typeof resendAgencySignupOtpSchema>;
