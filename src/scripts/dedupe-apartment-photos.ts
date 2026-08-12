/**
 * Force one-image-once for every apartment in MongoDB.
 * Usage: npx tsx src/scripts/dedupe-apartment-photos.ts
 */
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Apartment } from "../modules/apartments/apartment.model.js";
import { uniquePhotoUrls } from "../modules/apartments/photo-utils.js";

async function main() {
  await connectDatabase();
  const all = await Apartment.find({}).select("_id slug name photos");
  let changed = 0;

  for (const apt of all) {
    const before = apt.photos ?? [];
    const after = uniquePhotoUrls(before);
    if (before.length !== after.length || before.some((p, i) => p !== after[i])) {
      apt.photos = after;
      await apt.save();
      changed += 1;
      console.log(
        `✓ ${apt.slug}: ${before.length} → ${after.length} photo(s)`,
      );
    } else {
      console.log(`· ${apt.slug}: already unique (${after.length})`);
    }
  }

  console.log(`\nDone — updated ${changed} apartment(s)`);
  await disconnectDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
