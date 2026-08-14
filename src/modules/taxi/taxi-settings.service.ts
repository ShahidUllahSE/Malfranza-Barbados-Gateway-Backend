import { TaxiSettings } from "./taxi-settings.model.js";
import type { UpdateTaxiSettingsInput } from "./taxi.validation.js";

export type TaxiFareSettings = {
  /** USD per km for 1–4 guests (standard car). */
  fareFor1to4: number;
  /** USD per km for 5–7 guests (XL). */
  fareFor5to7: number;
  /** USD per km for 8–10 guests. */
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

/** Client rates: $/km by capacity tier. */
export const REGULATED_TAXI_FARES: TaxiFareSettings = {
  fareFor1to4: 1.62,
  fareFor5to7: 2.4,
  fareFor8to10: 4,
  fareFor1Guest: 1.62,
  fareFor2Guests: 1.62,
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
  const fareFor1to4 = Number(doc.fareFor1to4 ?? doc.fareFor1Guest ?? 1.62);
  const fareFor5to7 = Number(doc.fareFor5to7 ?? doc.fareFor3Guests ?? 2.4);
  const fareFor8to10 = Number(doc.fareFor8to10 ?? doc.fareFor4PlusGuests ?? 4);
  return {
    fareFor1to4,
    fareFor5to7,
    fareFor8to10,
    fareFor1Guest: fareFor1to4,
    fareFor2Guests: fareFor1to4,
    fareFor3Guests: fareFor5to7,
    fareFor4PlusGuests: fareFor8to10,
    perKmUsd: Number(doc.perKmUsd ?? 0),
    minimumFareUsd: Number(doc.minimumFareUsd ?? 5),
  };
}

function persistableFromInput(input: UpdateTaxiSettingsInput) {
  const fareFor1to4 = input.fareFor1to4 ?? input.fareFor1Guest ?? 1.62;
  const fareFor5to7 = input.fareFor5to7 ?? input.fareFor3Guests ?? 2.4;
  const fareFor8to10 = input.fareFor8to10 ?? input.fareFor4PlusGuests ?? 4;
  return {
    fareFor1to4,
    fareFor5to7,
    fareFor8to10,
    fareFor1Guest: fareFor1to4,
    fareFor2Guests: fareFor1to4,
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

/** Per-km rate for the passenger tier. */
export function guestFareFromSettings(settings: TaxiFareSettings, passengers: number): number {
  if (passengers <= 4) return settings.fareFor1to4;
  if (passengers <= 7) return settings.fareFor5to7;
  return settings.fareFor8to10;
}

/**
 * Distance × tier $/km, floored by minimum.
 */
export function calculateFareFromSettings(
  settings: TaxiFareSettings,
  distanceKm: number,
  passengers: number,
): number {
  const perKm = guestFareFromSettings(settings, passengers);
  const total = Math.max(0, distanceKm) * perKm;
  return Math.max(settings.minimumFareUsd, money(total));
}
