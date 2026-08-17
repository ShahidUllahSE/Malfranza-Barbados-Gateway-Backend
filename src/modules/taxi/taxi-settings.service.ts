import { TaxiSettings } from "./taxi-settings.model.js";
import type { UpdateTaxiSettingsInput } from "./taxi.validation.js";

export type TaxiFareSettings = {
  /** Legacy alias — fleet no longer offers a 4-seater; kept for older clients. */
  fareFor1to4: number;
  /** USD per km for XL 7-seater. */
  fareFor5to7: number;
  /** USD per km for 12-seater. */
  fareFor8to10: number;
  /** Aliases kept so older admin/UI clients still work. */
  fareFor1Guest: number;
  fareFor2Guests: number;
  fareFor3Guests: number;
  fareFor4PlusGuests: number;
  /** Legacy flat add-on — kept for schema compatibility; fare is tier $/km × distance. */
  perKmUsd: number;
  minimumFareUsd: number;
};

/** Client rates: $/km by vehicle capacity (7-seater / 12-seater only). */
export const REGULATED_TAXI_FARES: TaxiFareSettings = {
  fareFor1to4: 2.4,
  fareFor5to7: 2.4,
  fareFor8to10: 4,
  fareFor1Guest: 2.4,
  fareFor2Guests: 2.4,
  fareFor3Guests: 2.4,
  fareFor4PlusGuests: 4,
  perKmUsd: 0,
  minimumFareUsd: 5,
};

const DEFAULTS: TaxiFareSettings = REGULATED_TAXI_FARES;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function toSettings(doc: {
  fareFor1to4?: number;
  fareFor5to7?: number;
  fareFor8to10?: number;
  fareFor1Guest?: number;
  fareFor2Guests?: number;
  fareFor3Guests?: number;
  fareFor4PlusGuests?: number;
  perKmUsd: number;
  minimumFareUsd: number;
}): TaxiFareSettings {
  const fareFor5to7 = Number(doc.fareFor5to7 ?? doc.fareFor3Guests ?? 2.4);
  const fareFor8to10 = Number(doc.fareFor8to10 ?? doc.fareFor4PlusGuests ?? 4);
  // 4-seater tier retired — map legacy field to 7-seater rate when missing.
  const fareFor1to4 = Number(doc.fareFor1to4 ?? doc.fareFor1Guest ?? fareFor5to7);
  return {
    fareFor1to4,
    fareFor5to7,
    fareFor8to10,
    fareFor1Guest: fareFor5to7,
    fareFor2Guests: fareFor5to7,
    fareFor3Guests: fareFor5to7,
    fareFor4PlusGuests: fareFor8to10,
    perKmUsd: Number(doc.perKmUsd ?? 0),
    minimumFareUsd: Number(doc.minimumFareUsd ?? 5),
  };
}

function persistableFromInput(input: UpdateTaxiSettingsInput) {
  const fareFor5to7 = input.fareFor5to7 ?? input.fareFor3Guests ?? 2.4;
  const fareFor8to10 = input.fareFor8to10 ?? input.fareFor4PlusGuests ?? 4;
  const fareFor1to4 = input.fareFor1to4 ?? input.fareFor1Guest ?? fareFor5to7;
  return {
    fareFor1to4,
    fareFor5to7,
    fareFor8to10,
    fareFor1Guest: fareFor5to7,
    fareFor2Guests: fareFor5to7,
    fareFor3Guests: fareFor5to7,
    fareFor4PlusGuests: fareFor8to10,
    perKmUsd: input.perKmUsd ?? 0,
    minimumFareUsd: input.minimumFareUsd,
  };
}

/** Load (or create) the singleton taxi pricing settings. */
export async function getTaxiSettings(): Promise<TaxiFareSettings> {
  const existing = await TaxiSettings.findOne({ key: "default" }).lean();
  if (existing) return toSettings(existing);

  const created = await TaxiSettings.create({ key: "default", ...DEFAULTS });
  return toSettings(created);
}

export async function updateTaxiSettings(input: UpdateTaxiSettingsInput): Promise<TaxiFareSettings> {
  const updated = await TaxiSettings.findOneAndUpdate(
    { key: "default" },
    { $set: { ...persistableFromInput(input), key: "default" } },
    { new: true, upsert: true, runValidators: true },
  );
  return toSettings(updated!);
}

/** Per-km rate: ≤7 → XL 7-seater, else 12-seater ($4/km). */
export function vehicleFareFromSettings(settings: TaxiFareSettings, capacity: number): number {
  if (capacity <= 7) return settings.fareFor5to7;
  return settings.fareFor8to10;
}

/** @deprecated Prefer vehicleFareFromSettings — rates are by vehicle size, not party size. */
export function guestFareFromSettings(settings: TaxiFareSettings, passengers: number): number {
  return vehicleFareFromSettings(settings, passengers);
}

/**
 * Distance × vehicle-tier $/km, floored by minimum.
 * `capacity` is the van's passenger capacity (7 or 12), not how many guests booked.
 */
export function calculateFareFromSettings(
  settings: TaxiFareSettings,
  distanceKm: number,
  capacity: number,
): number {
  const perKm = vehicleFareFromSettings(settings, capacity);
  const total = Math.max(0, distanceKm) * perKm;
  return Math.max(settings.minimumFareUsd, money(total));
}
