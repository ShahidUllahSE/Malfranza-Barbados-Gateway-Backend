/**
 * One URL once per apartment. De-dupes by exact string and by Cloudinary public id.
 */
export function uniquePhotoUrls(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const p = raw.trim();
    if (!p) continue;
    if (p.includes("placeholder") || p.includes("ChatGPT Image")) continue;

    const key = photoIdentity(p);
    if (seen.has(key) || seen.has(p)) continue;
    seen.add(key);
    seen.add(p);
    out.push(p);
  }
  return out;
}

export function photoIdentity(url: string): string {
  const noQuery = url.split("?")[0] ?? url;
  try {
    const u = new URL(noQuery);
    const m = u.pathname.match(/\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(.+)$/i);
    if (m?.[1]) {
      return m[1].replace(/\.[a-z0-9]+$/i, "").toLowerCase();
    }
    return u.pathname.toLowerCase();
  } catch {
    return noQuery
      .replace(/\/w_\d+[^/]*\//g, "/")
      .replace(/\.[a-z0-9]+$/i, "")
      .toLowerCase();
  }
}

/** Attach unique photos onto a lean apartment document. */
export function withUniquePhotos<T extends { photos?: string[] }>(doc: T): T {
  return {
    ...doc,
    photos: uniquePhotoUrls(doc.photos),
  };
}
