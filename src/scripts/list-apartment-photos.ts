import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Apartment } from "../modules/apartments/apartment.model.js";

async function main() {
  await connectDatabase();
  const all = await Apartment.find({}).select("slug name photos").lean();
  console.log("apartments:", all.length);
  for (const a of all) {
    const photos = (a.photos as string[] | undefined) ?? [];
    console.log("\n===", a.slug, "|", a.name, "| count=", photos.length);
    photos.forEach((p, i) => {
      const short = p.replace(/^.*\/upload\//, "").slice(0, 100);
      console.log(`  ${i}: ${short}`);
    });
    const norms = photos.map((p) => {
      try {
        const u = new URL(p);
        // cloudinary path after version: folder/name
        const m = u.pathname.match(/\/upload\/(?:v\d+\/)?(.+)$/);
        return (m?.[1] ?? u.pathname).replace(/\.[a-z]+$/i, "");
      } catch {
        return p;
      }
    });
    const set = new Set(norms);
    if (set.size !== photos.length) {
      console.log("  >> exact public_id dups:", photos.length - set.size);
    }
  }
  await disconnectDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
