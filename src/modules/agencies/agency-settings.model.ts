import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Singleton travel-agency commission settings.
 * Admin can change the default %; new bookings use each agency's rate
 * (synced from this default when admin updates it).
 */
const agencySettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    /** Fraction 0–1 (e.g. 0.1 = 10%). Applied to stay subtotal only. */
    defaultCommissionRate: { type: Number, required: true, min: 0, max: 1, default: 0.1 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type AgencySettingsRecord = InferSchemaType<typeof agencySettingsSchema>;
export const AgencySettings = model<AgencySettingsRecord>("AgencySettings", agencySettingsSchema);
