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

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type LoginUserInput = z.infer<typeof loginUserSchema>;
