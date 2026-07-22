import { Types } from "mongoose";
import { z } from "zod";

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");

const apartmentUnitSchema = z.object({
  _id: z.string().refine(Types.ObjectId.isValid, "Invalid unit ID").optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  bedrooms: z.number().int().min(1).max(10),
  bathrooms: z.number().int().min(1).max(10),
  maxGuests: z.number().int().min(1).max(20),
  pricePerNight: z.number().nonnegative(),
  isActive: z.boolean().default(true),
});

const apartmentFields = {
  name: z.string().trim().min(2).max(120),
  slug,
  subtitle: z.string().trim().max(160).optional(),
  description: z.string().trim().min(10).max(3000),
  type: z.enum(["one-bedroom", "two-bedroom", "three-bedroom"]),
  pricePerNight: z.number().nonnegative(),
  maxGuests: z.number().int().min(1).max(20),
  bedrooms: z.number().int().min(1).max(10),
  bathrooms: z.number().int().min(1).max(10),
  sizeSqM: z.number().positive().optional(),
  amenities: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  photos: z.array(z.string().trim().min(1).max(2000)).max(100).default([]),
  units: z.array(apartmentUnitSchema).max(20).default([]),
  isActive: z.boolean().default(true),
};

export const createApartmentSchema = z.object(apartmentFields);

export const updateApartmentSchema = z
  .object({
    name: apartmentFields.name.optional(),
    slug: apartmentFields.slug.optional(),
    subtitle: apartmentFields.subtitle,
    description: apartmentFields.description.optional(),
    type: apartmentFields.type.optional(),
    pricePerNight: apartmentFields.pricePerNight.optional(),
    maxGuests: apartmentFields.maxGuests.optional(),
    bedrooms: apartmentFields.bedrooms.optional(),
    bathrooms: apartmentFields.bathrooms.optional(),
    sizeSqM: apartmentFields.sizeSqM,
    amenities: apartmentFields.amenities.optional(),
    photos: apartmentFields.photos.optional(),
    units: apartmentFields.units.optional(),
    isActive: apartmentFields.isActive.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Provide at least one field to update");

export const publicApartmentQuerySchema = z.object({
  type: apartmentFields.type.optional(),
  guests: z.coerce.number().int().min(1).max(20).optional(),
  sort: z.enum(["price-asc", "price-desc", "newest"]).default("price-asc"),
});

export const adminApartmentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const apartmentSlugParamSchema = z.object({ slug });

export const apartmentIdParamSchema = z.object({
  id: z.string().refine(Types.ObjectId.isValid, "Invalid apartment ID"),
});

export type CreateApartmentInput = z.infer<typeof createApartmentSchema>;
export type UpdateApartmentInput = z.infer<typeof updateApartmentSchema>;
export type PublicApartmentQuery = z.infer<typeof publicApartmentQuerySchema>;
export type AdminApartmentQuery = z.infer<typeof adminApartmentQuerySchema>;
