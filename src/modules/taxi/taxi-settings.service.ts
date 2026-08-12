import { TaxiSettings } from "./taxi-settings.model.js";
import type { UpdateTaxiSettingsInput } from "./taxi.validation.js";

export type TaxiFareSettings = {
  fareFor1to4: number;
  fareFor5to7: number;
  fareFor8to10: number;
  /** Aliases kept so older admin/UI clients still work. */
  fareFor1Guest: number;
  fareFor2Guests: number;
  fareFor3Guests: number;
  fareFor4PlusGuests: number;
  perKmUsd: number;
  minimumFareUsd: number;
};

/** Capacity tiers from the client spec. Exact sheet TBD — demo-safe USD amounts. */
export const REGULATED_TAXI_FARES: TaxiFareSettings = {
  fareFor1to4: 25,
  fareFor5to7: 35,
  fareFor8to10: 45,
  fareFor1Guest: 25,
  fareFor2Guests: 25,
  fareFor3Guests: 35,
  fareFor4PlusGuests: 45,
  perKmUsd: 0,
  minimumFareUsd: 25,
};

const DEFAULTS: TaxiFareSettings = REGULATED_TAXI_FARES;

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
  const fareFor1to4 = Number(doc.fareFor1to4 ?? doc.fareFor1Guest ?? 25);
  const fareFor5to7 = Number(doc.fareFor5to7 ?? doc.fareFor3Guests ?? 35);
  const fareFor8to10 = Number(doc.fareFor8to10 ?? doc.fareFor4PlusGuests ?? 45);
  return {
    fareFor1to4,
    fareFor5to7,
    fareFor8to10,
    fareFor1Guest: fareFor1to4,
    fareFor2Guests: fareFor1to4,
    fareFor3Guests: fareFor5to7,
    fareFor4PlusGuests: fareFor8to10,
    perKmUsd: Number(doc.perKmUsd ?? 0),
    minimumFareUsd: Number(doc.minimumFareUsd ?? 25),
  };
}

function persistableFromInput(input: UpdateTaxiSettingsInput) {
  const fareFor1to4 = input.fareFor1to4 ?? input.fareFor1Guest ?? 25;
  const fareFor5to7 = input.fareFor5to7 ?? input.fareFor3Guests ?? 35;
  const fareFor8to10 = input.fareFor8to10 ?? input.fareFor4PlusGuests ?? 45;
  return {
    fareFor1to4,
    fareFor5to7,
    fareFor8to10,
    fareFor1Guest: fareFor1to4,
    fareFor2Guests: fareFor1to4,
    fareFor3Guests: fareFor5to7,
    fareFor4PlusGuests: fareFor8to10,
    perKmUsd: input.perKmUsd,
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

export function guestFareFromSettings(settings: TaxiFareSettings, passengers: number): number {
  if (passengers <= 4) return settings.fareFor1to4;
  if (passengers <= 7) return settings.fareFor5to7;
  return settings.fareFor8to10;
}

/**
 * Guest-bracket fare + optional per-km charge, floored by minimum.
 */
export function calculateFareFromSettings(
  settings: TaxiFareSettings,
  distanceKm: number,
  passengers: number,
): number {
  const guestFare = guestFareFromSettings(settings, passengers);
  const distanceCharge = Math.max(0, distanceKm) * settings.perKmUsd;
  const total = guestFare + distanceCharge;
  return Math.max(settings.minimumFareUsd, Math.round(total));
}
