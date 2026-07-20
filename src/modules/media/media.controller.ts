import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../../middleware/error-handler.js";
import { deleteImage, uploadApartmentImage } from "./media.service.js";

const deleteImageSchema = z.object({
  publicId: z.string().trim().min(1).max(500),
});

export const postApartmentImage: RequestHandler = async (request, response) => {
  if (!request.file) {
    throw new AppError(400, "An image file is required");
  }

  const image = await uploadApartmentImage(request.file.buffer);
  response.status(201).json({ success: true, data: image });
};

export const deleteApartmentImage: RequestHandler = async (request, response) => {
  const { publicId } = deleteImageSchema.parse(request.body);
  await deleteImage(publicId);
  response.status(200).json({ success: true, message: "Image deleted" });
};
