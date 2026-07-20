import type { RequestHandler } from "express";
import {
  createApartment,
  deactivateApartment,
  getAdminApartment,
  listAdminApartments,
  updateApartment,
} from "./apartment.service.js";
import {
  adminApartmentQuerySchema,
  apartmentIdParamSchema,
  createApartmentSchema,
  updateApartmentSchema,
} from "./apartment.validation.js";

export const getAdminApartments: RequestHandler = async (request, response) => {
  const input = adminApartmentQuerySchema.parse(request.query);
  const result = await listAdminApartments(input);
  response.status(200).json({ success: true, data: result });
};

export const getAdminApartmentById: RequestHandler = async (request, response) => {
  const { id } = apartmentIdParamSchema.parse(request.params);
  const apartment = await getAdminApartment(id);
  response.status(200).json({ success: true, data: apartment });
};

export const postApartment: RequestHandler = async (request, response) => {
  const input = createApartmentSchema.parse(request.body);
  const apartment = await createApartment(input);
  response.status(201).json({ success: true, data: apartment });
};

export const patchApartment: RequestHandler = async (request, response) => {
  const { id } = apartmentIdParamSchema.parse(request.params);
  const input = updateApartmentSchema.parse(request.body);
  const apartment = await updateApartment(id, input);
  response.status(200).json({ success: true, data: apartment });
};

export const deleteApartment: RequestHandler = async (request, response) => {
  const { id } = apartmentIdParamSchema.parse(request.params);
  const apartment = await deactivateApartment(id);
  response.status(200).json({
    success: true,
    message: "Apartment deactivated",
    data: apartment,
  });
};
