import { AgencySettings } from "./agency-settings.model.js";
import { TravelAgency, AGENCY_COMMISSION_RATE } from "./agency.model.js";

export type AgencyCommissionSettings = {
  /** Fraction 0–1 (e.g. 0.1 = 10%). */
  defaultCommissionRate: number;
  /** Whole percent for UI (e.g. 10). */
  defaultCommissionPercent: number;
};

function toSettings(doc: { defaultCommissionRate?: number }): AgencyCommissionSettings {
  const rate = Number(doc.defaultCommissionRate ?? AGENCY_COMMISSION_RATE);
  const clamped = Math.min(1, Math.max(0, Number.isFinite(rate) ? rate : AGENCY_COMMISSION_RATE));
  return {
    defaultCommissionRate: clamped,
    defaultCommissionPercent: Math.round(clamped * 1000) / 10,
  };
}

export async function getAgencyCommissionSettings(): Promise<AgencyCommissionSettings> {
  const existing = await AgencySettings.findOne({ key: "default" }).lean();
  if (existing) return toSettings(existing);

  const created = await AgencySettings.create({
    key: "default",
    defaultCommissionRate: AGENCY_COMMISSION_RATE,
  });
  return toSettings(created);
}

export async function getDefaultCommissionRate(): Promise<number> {
  const settings = await getAgencyCommissionSettings();
  return settings.defaultCommissionRate;
}

/**
 * Update platform default commission rate.
 * When applyToAllAgencies is true (default), every agency’s rate is synced
 * so future bookings use the new %. Historical bookings keep their snapshot.
 */
export async function updateAgencyCommissionSettings(input: {
  /** Whole percent 0–100, or fraction 0–1. */
  defaultCommissionPercent?: number;
  defaultCommissionRate?: number;
  applyToAllAgencies?: boolean;
}): Promise<AgencyCommissionSettings> {
  let rate = input.defaultCommissionRate;
  if (rate == null && input.defaultCommissionPercent != null) {
    rate = Number(input.defaultCommissionPercent) / 100;
  }
  if (rate == null || !Number.isFinite(rate)) {
    rate = AGENCY_COMMISSION_RATE;
  }
  rate = Math.min(1, Math.max(0, Math.round(rate * 10000) / 10000));

  const updated = await AgencySettings.findOneAndUpdate(
    { key: "default" },
    { $set: { key: "default", defaultCommissionRate: rate } },
    { new: true, upsert: true, runValidators: true },
  );

  const apply = input.applyToAllAgencies !== false;
  if (apply) {
    await TravelAgency.updateMany({}, { $set: { commissionRate: rate } });
  }

  return toSettings(updated!);
}
