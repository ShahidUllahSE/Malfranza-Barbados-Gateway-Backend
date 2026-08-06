import { env } from "../../config/env.js";
import { TaxiSettings } from "./taxi-settings.model.js";
import type { UpdateTaxiSettingsInput } from "./taxi.validation.js";

export type TaxiFareSettings = {
  fareFor1Guest: number;
  fareFor2Guests: number;
  fareFor3Guests: number;
  fareFor4PlusGuests: number;
  perKmUsd: number;
  minimumFareUsd: number;
};

const DEFAULTS: TaxiFareSettings = {
  fareFor1Guest: 25,
  fareFor2Guests: 30,
  fareFor3Guests: 35,
  fareFor4PlusGuests: 45,
  perKmUsd: env.TAXI_PER_KM_USD,
  minimumFareUsd: env.TAXI_MINIMUM_FARE_USD,
};

function toSettings(doc: {
  fareFor1Guest: number;
  fareFor2Guests: number;
  fareFor3Guests: number;
  fareFor4PlusGuests: number;
  perKmUsd: number;
  minimumFareUsd: number;
}): TaxiFareSettings {
  return {
    fareFor1Guest: doc.fareFor1Guest,
    fareFor2Guests: doc.fareFor2Guests,
    fareFor3Guests: doc.fareFor3Guests,
    fareFor4PlusGuests: doc.fareFor4PlusGuests,
    perKmUsd: doc.perKmUsd,
    minimumFareUsd: doc.minimumFareUsd,
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
    { $set: input, $setOnInsert: { key: "default" } },
    { new: true, upsert: true, runValidators: true },
  );
  return toSettings(updated!);
}

export function guestFareFromSettings(settings: TaxiFareSettings, passengers: number): number {
  if (passengers <= 1) return settings.fareFor1Guest;
  if (passengers === 2) return settings.fareFor2Guests;
  if (passengers === 3) return settings.fareFor3Guests;
  return settings.fareFor4PlusGuests;
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
