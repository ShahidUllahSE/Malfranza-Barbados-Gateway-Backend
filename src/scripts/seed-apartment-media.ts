import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudinary } from "../config/cloudinary.js";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Apartment } from "../modules/apartments/apartment.model.js";
import { uniquePhotoUrls } from "../modules/apartments/photo-utils.js";

/**
 * Upload up to 6 images per room from:
 *   frontend src/assets/rooms/{slug}_{name}/*
 * Falls back to legacy src/assets/newimage filename patterns.
 *
 * Usage: npx tsx src/scripts/seed-apartment-media.ts
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../../../Malfranza Barbados Gateway");
const roomsDir = path.join(frontendRoot, "src/assets/rooms");
const legacyDir = path.join(frontendRoot, "src/assets/newimage");

const MAX_PER_SLUG = 8;

const rooms: Array<{
  slug: string;
  folderHint: string;
  dedicatedDir?: string;
  legacyMatch: RegExp;
  label: string;
}> = [
  {
    slug: "apartment-1",
    folderHint: "tropical-escape",
    dedicatedDir: "room1",
    legacyMatch: /apartment number 1/i,
    label: "Tropical Escape (Room 1)",
  },
  {
    slug: "apartment-2",
    folderHint: "island-breeze",
    dedicatedDir: "room2",
    legacyMatch: /apartment number 2/i,
    label: "Island Breeze (Room 2)",
  },
  {
    slug: "apartment-3",
    folderHint: "palm-retreat",
    dedicatedDir: "room3",
    legacyMatch: /apartment number 3/i,
    label: "Palm Retreat (Room 3)",
  },
  {
    slug: "apartment-4",
    folderHint: "golden-serenity",
    dedicatedDir: "room4",
    legacyMatch: /apartment number 4|golden/i,
    label: "Golden Serenity (Room 4)",
  },
  {
    slug: "apartment-a-and-b",
    folderHint: "sunset-suite",
    dedicatedDir: "Malfranza A and B",
    legacyMatch: /a and b|sunset/i,
    label: "Sunset Suite (Room A & B)",
  },
];

function listImagesFromDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((name) => path.join(dir, name));
}

function findRoomFolder(slug: string, hint: string): string | null {
  if (!fs.existsSync(roomsDir)) return null;
  const entries = fs.readdirSync(roomsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  const bySlug = entries.find((d) => d.name.startsWith(`${slug}_`) || d.name === slug);
  if (bySlug) return path.join(roomsDir, bySlug.name);
  const byHint = entries.find((d) => d.name.toLowerCase().includes(hint.toLowerCase()));
  if (byHint) return path.join(roomsDir, byHint.name);
  return null;
}

function pickFiles(
  slug: string,
  hint: string,
  legacyMatch: RegExp,
  dedicatedDir?: string,
): string[] {
  // 1) Curated rooms/{slug}_* folder
  const roomFolder = findRoomFolder(slug, hint);
  if (roomFolder) {
    const fromRoom = listImagesFromDir(roomFolder).slice(0, MAX_PER_SLUG);
    if (fromRoom.length > 0) return fromRoom;
  }

  // 2) Dedicated assets folder (e.g. room1 for Tropical Escape)
  if (dedicatedDir) {
    const dedicated = path.join(frontendRoot, "src/assets", dedicatedDir);
    const fromDedicated = listImagesFromDir(dedicated).slice(0, MAX_PER_SLUG);
    if (fromDedicated.length > 0) return fromDedicated;
  }

  // 3) Legacy newimage — never for rooms with dedicated asset folders
  if (!fs.existsSync(legacyDir)) return [];
  if (
    slug === "apartment-1" ||
    slug === "apartment-2" ||
    slug === "apartment-3" ||
    slug === "apartment-4" ||
    slug === "apartment-a-and-b"
  ) {
    return [];
  }
  return fs
    .readdirSync(legacyDir)
    .filter((name) => /\.(jpe?g|png)$/i.test(name) && legacyMatch.test(name))
    .map((name) => ({
      name,
      full: path.join(legacyDir, name),
      size: fs.statSync(path.join(legacyDir, name)).size,
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_PER_SLUG)
    .map((x) => x.full);
}

async function uploadFile(filePath: string, publicId: string): Promise<string> {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: "malfranza/apartments",
    public_id: publicId,
    overwrite: true,
    invalidate: true,
    unique_filename: false,
    resource_type: "image",
    transformation: [{ width: 2000, height: 1500, crop: "limit", quality: "auto", fetch_format: "auto" }],
  });
  return cloudinary.url(result.public_id, {
    secure: true,
    version: result.version,
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
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));

  for (const room of rooms) {
    if (only.length > 0 && !only.includes(room.slug)) continue;
    const files = pickFiles(room.slug, room.folderHint, room.legacyMatch, room.dedicatedDir);
    if (files.length === 0) {
      console.warn(`⚠ No images for ${room.label} (${room.slug}) — skip`);
      continue;
    }
    console.log(`↑ ${room.label}: ${files.length} file(s)`);
    const photos: string[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]!;
      const base = path
        .basename(file, path.extname(file))
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .toLowerCase();
      const url = await uploadFile(file, `${room.slug}/${base}`);
      photos.push(url);
      uploaded += 1;
      console.log(`    ${i + 1}/${files.length} ${path.basename(file)}`);
    }
    const unique = uniquePhotoUrls(photos);
    const result = await Apartment.updateOne({ slug: room.slug }, { $set: { photos: unique } });
    if (result.matchedCount === 0) {
      console.warn(`  Apartment not found for slug ${room.slug} — run seed:apartments first`);
    } else {
      console.log(`  ✓ DB updated with ${unique.length} unique photos`);
    }
  }

  console.log(`Done — ${uploaded} images uploaded to Cloudinary`);
}

seedApartmentMedia()
  .catch((error: unknown) => {
    console.error("Cloudinary media seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
