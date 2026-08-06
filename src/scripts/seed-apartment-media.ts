import fs from "node:fs";
import path from "node:path";
import { cloudinary } from "../config/cloudinary.js";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Apartment } from "../modules/apartments/apartment.model.js";

const newImageDir = "D:\\Malfranza Barbados Gateway\\src\\assets\\newimage";

/** Max photos per property on Cloudinary (keeps seed fast). Local frontend still serves full galleries. */
const MAX_PER_SLUG = 12;

const galleries: Array<{ slug: string; match: RegExp }> = [
  { slug: "apartment-1", match: /apartment number 1/i },
  { slug: "apartment-2", match: /apartment number 2/i },
  { slug: "apartment-3", match: /apartment number 3/i },
  { slug: "apartment-a-and-b", match: /a and b/i },
];

function listFiles(match: RegExp): string[] {
  if (!fs.existsSync(newImageDir)) {
    throw new Error(`newimage folder not found: ${newImageDir}`);
  }
  return fs
    .readdirSync(newImageDir)
    .filter((name) => /\.(jpe?g|png)$/i.test(name) && match.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .slice(0, MAX_PER_SLUG)
    .map((name) => path.join(newImageDir, name));
}

async function uploadFile(filePath: string, publicId: string): Promise<string> {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: "malfranza/apartments",
    public_id: publicId,
    overwrite: true,
    unique_filename: false,
    resource_type: "image",
  });
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
  let uploaded = 0;

  for (const gallery of galleries) {
    const files = listFiles(gallery.match);
    if (files.length === 0) {
      console.warn(`No images for ${gallery.slug}`);
      continue;
    }
    const photos: string[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]!;
      const base = path.basename(file, path.extname(file)).replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
      const url = await uploadFile(file, `${gallery.slug}/${base}`);
      photos.push(url);
      uploaded += 1;
      console.log(`  ↑ ${gallery.slug} (${i + 1}/${files.length})`);
    }
    await Apartment.updateOne({ slug: gallery.slug }, { $set: { photos } });
    console.log(`Updated ${gallery.slug} with ${photos.length} photos`);
  }

  console.log(`Cloudinary media seed complete (${uploaded} images uploaded)`);
}

seedApartmentMedia()
  .catch((error: unknown) => {
    console.error("Cloudinary media seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
