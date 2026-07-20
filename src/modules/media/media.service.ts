import type { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../config/cloudinary.js";

export async function uploadApartmentImage(buffer: Buffer): Promise<{
  url: string;
  publicId: string;
  width: number;
  height: number;
}> {
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "malfranza/apartments",
        resource_type: "image",
      },
      (error, response) => {
        if (error || !response) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve(response);
      },
    );

    stream.end(buffer);
  });

  return {
    url: cloudinary.url(result.public_id, {
      secure: true,
      width: 2000,
      height: 1500,
      crop: "limit",
      quality: "auto",
      fetch_format: "auto",
    }),
    publicId: result.public_id,
    width: result.width,
    height: result.height,
  };
}

export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}
