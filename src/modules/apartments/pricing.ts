/**
 * Seasonal + room-type pricing (USD / room / night).
 * Amplifi AI · Final Room Rates (Aug 2026) — PayPal fee already included.
 * Keep in sync with frontend `src/lib/pricing.ts`.
 *
 * | Room Type   | Out of Season | Summer / Peak |
 * | One-bedroom | $95           | $100          |
 * | Two-bedroom | $105          | $115          |
 *
 * Peak (provisional until confirmed): mid-Dec → mid-Apr + Jul–Aug.
 * Floor is $95; two-bedroom is always above one-bedroom.
 * No separate PayPal fee at checkout — built into these rates.
 */

export type PricedRoomType = "one-bedroom" | "two-bedroom";

const RATES: Record<PricedRoomType, { off: number; peak: number }> = {
  "one-bedroom": { off: 95, peak: 100 },
  "two-bedroom": { off: 105, peak: 115 },
};

/** Absolute lowest publishable rate on the platform. */
export const PLATFORM_MIN_NIGHTLY = 95;

export function isPeakSeason(isoDate: string): boolean {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();

  // High season: 15 Dec – 14 Apr
  if (month === 12 && day >= 15) return true;
  if (month >= 1 && month <= 3) return true;
  if (month === 4 && day <= 14) return true;

  // Summer peak: 1 Jul – 31 Aug
  if (month === 7 || month === 8) return true;

  return false;
}

export function roomTypeFromBedrooms(bedrooms: number): PricedRoomType {
  return bedrooms >= 2 ? "two-bedroom" : "one-bedroom";
}

export function nightlyRate(roomType: PricedRoomType, isoDate: string): number {
  const band = RATES[roomType];
  const rate = isPeakSeason(isoDate) ? band.peak : band.off;
  return Math.max(PLATFORM_MIN_NIGHTLY, rate);
}

/** Catalog “from” price (lowest band for the type). */
export function catalogFromRate(roomType: PricedRoomType): number {
  return RATES[roomType].off;
}

export function stayNights(checkIn: string, checkOut: string): string[] {
  const start = checkIn.slice(0, 10);
  const end = checkOut.slice(0, 10);
  const out: string[] = [];
  let cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor < last) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return out;
}

export function staySubtotal(roomType: PricedRoomType, checkIn: string, checkOut: string): number {
  const nights = stayNights(checkIn, checkOut);
  const total = nights.reduce((sum, day) => sum + nightlyRate(roomType, day), 0);
  return Math.round(total * 100) / 100;
}

/** Average nightly for a stay (for UI “≈ $X / night”). */
export function averageNightly(
  roomType: PricedRoomType,
  checkIn: string,
  checkOut: string,
): number {
  const nights = stayNights(checkIn, checkOut);
  if (nights.length === 0) return catalogFromRate(roomType);
  const total = staySubtotal(roomType, checkIn, checkOut);
  return Math.round((total / nights.length) * 100) / 100;
}

export const RATE_TABLE = {
  "one-bedroom": { off: 95, peak: 100 },
  "two-bedroom": { off: 105, peak: 115 },
} as const;
