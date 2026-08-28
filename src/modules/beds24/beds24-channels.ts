export type Beds24ChannelId = "booking" | "expedia" | "airbnb" | "vrbo" | "direct";

export const BEDS24_CHANNEL_IDS: Beds24ChannelId[] = [
  "booking",
  "expedia",
  "airbnb",
  "vrbo",
  "direct",
];

/** Substrings matched against Beds24 booking `apiSource` (case-insensitive). */
export const BEDS24_CHANNEL_SOURCES: Record<Beds24ChannelId, string[]> = {
  booking: ["booking", "booking.com", "bookingsuite", "bookingcom"],
  expedia: ["expedia", "hotels.com", "hotelscom", "expedia.com"],
  airbnb: ["airbnb"],
  vrbo: ["vrbo", "homeaway", "homeaway.com"],
  direct: ["direct", "beds24", "website", "malfranza", "manual", "ibe"],
};

export function isBeds24ChannelId(value: string): value is Beds24ChannelId {
  return (BEDS24_CHANNEL_IDS as string[]).includes(value);
}

export function normalizeApiSource(source: unknown): string {
  return String(source ?? "")
    .trim()
    .toLowerCase();
}

export function bookingMatchesChannel(apiSource: unknown, channel: Beds24ChannelId): boolean {
  const normalized = normalizeApiSource(apiSource);
  if (!normalized) {
    return channel === "direct";
  }

  const needles = BEDS24_CHANNEL_SOURCES[channel];
  return needles.some((needle) => normalized.includes(needle));
}

export function extractBeds24DataArray(payload: unknown): unknown[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "object" && payload !== null) {
    const obj = payload as { data?: unknown };
    if (Array.isArray(obj.data)) return obj.data;
  }
  return [];
}

export function filterBookingsResponseByChannel(payload: unknown, channel: Beds24ChannelId): unknown {
  const rows = extractBeds24DataArray(payload);
  const filtered = rows.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const apiSource = (row as { apiSource?: unknown }).apiSource;
    return bookingMatchesChannel(apiSource, channel);
  });

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      ...(payload as Record<string, unknown>),
      data: filtered,
      count: filtered.length,
    };
  }

  return filtered;
}
