import path from "node:path";
import { cloudinary } from "../config/cloudinary.js";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Apartment } from "../modules/apartments/apartment.model.js";

const frontendAssets = "D:\\Malfranza Barbados Gateway\\src\\assets";

const sourceImages = {
  garden: "ChatGPT Image Jul 2, 2026, 10_49_00 PM.png",
  oneBedroom: "ChatGPT Image Jul 2, 2026, 10_49_34 PM.png",
  kitchen: "ChatGPT Image Jul 2, 2026, 10_49_20 PM.png",
  tropical: "ChatGPT Image Jul 2, 2026, 10_49_27 PM.png",
  familyInterior: "ChatGPT Image Jul 2, 2026, 10_49_43 PM.png",
  bathroom: "ChatGPT Image Jul 2, 2026, 10_49_13 PM.png",
} as const;

async function uploadSource(name: keyof typeof sourceImages): Promise<string> {
  const result = await cloudinary.uploader.upload(
    path.join(frontendAssets, sourceImages[name]),
    {
      folder: "malfranza/apartments",
      public_id: name,
      overwrite: true,
      unique_filename: false,
      resource_type: "image",
    },
  );

  return cloudinary.url(result.public_id, {
    secure: true,
    width: 2000,
    height: 1500,
    crop: "limit",
    quality: "auto",
    fetch_format: "auto",
  });
}

async function seedApartmentMedia(): Promise<void> {
  await connectDatabase();

  const entries = await Promise.all(
    (Object.keys(sourceImages) as Array<keyof typeof sourceImages>).map(
      async (name) => [name, await uploadSource(name)] as const,
    ),
  );
  const images = Object.fromEntries(entries) as Record<keyof typeof sourceImages, string>;

  const galleries: Record<string, string[]> = {
    "garden-view": [images.garden, images.kitchen, images.bathroom, images.oneBedroom],
    "city-view": [images.oneBedroom, images.kitchen, images.bathroom, images.familyInterior],
    "modern-comfort": [images.kitchen, images.oneBedroom, images.bathroom, images.tropical],
    "tropical-escape": [images.tropical, images.kitchen, images.bathroom, images.garden],
    "family-stay": [images.familyInterior, images.kitchen, images.bathroom, images.garden],
  };

  for (const [slug, photos] of Object.entries(galleries)) {
    await Apartment.updateOne({ slug }, { $set: { photos } });
  }

  console.log(`Cloudinary media seed complete (${entries.length} images uploaded)`);
}

seedApartmentMedia()
  .catch((error: unknown) => {
    console.error("Cloudinary media seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
