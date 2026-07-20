import type { RequestHandler } from "express";
import {
  getPublicApartment,
  listPublicApartments,
} from "./apartment.service.js";
import {
  apartmentSlugParamSchema,
  publicApartmentQuerySchema,
} from "./apartment.validation.js";

export const getApartments: RequestHandler = async (request, response) => {
  const input = publicApartmentQuerySchema.parse(request.query);
  const apartments = await listPublicApartments(input);
  response.status(200).json({ success: true, data: apartments });
};

export const getApartmentBySlug: RequestHandler = async (request, response) => {
  const { slug } = apartmentSlugParamSchema.parse(request.params);
  const apartment = await getPublicApartment(slug);
  response.status(200).json({ success: true, data: apartment });
};
