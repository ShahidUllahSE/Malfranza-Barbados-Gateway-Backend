import { z } from "zod";

const credentials = {
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
};

export const registerUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z
    .union([z.string().trim().min(6).max(40), z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  ...credentials,
});

export const loginUserSchema = z.object(credentials);

export const verifySignupOtpSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});

export const resendSignupOtpSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type LoginUserInput = z.infer<typeof loginUserSchema>;
export type VerifySignupOtpInput = z.infer<typeof verifySignupOtpSchema>;
export type ResendSignupOtpInput = z.infer<typeof resendSignupOtpSchema>;
