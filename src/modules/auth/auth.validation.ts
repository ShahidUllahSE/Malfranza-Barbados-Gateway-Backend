import { z } from "zod";

const credentials = {
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
};

export const bootstrapAdminSchema = z.object({
  ...credentials,
  bootstrapKey: z.string().min(1),
});

export const loginSchema = z.object(credentials);

export const createAdminAccountSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAdminAccountInput = z.infer<typeof createAdminAccountSchema>;
