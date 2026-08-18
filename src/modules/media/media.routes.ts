import { Router } from "express";
import multer from "multer";
import { authenticateAdmin, requireRole } from "../../middleware/auth.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  deleteApartmentImage,
  postApartmentImage,
} from "./media.controller.js";

const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      callback(new AppError(415, "Only JPEG, PNG, WebP and AVIF images are allowed"));
      return;
    }
    callback(null, true);
  },
});

export const mediaRouter = Router();

mediaRouter.use(authenticateAdmin);
mediaRouter.use(requireRole("admin"));

mediaRouter.post("/images", upload.single("image"), postApartmentImage);
mediaRouter.delete("/images", requireRole("admin"), deleteApartmentImage);
