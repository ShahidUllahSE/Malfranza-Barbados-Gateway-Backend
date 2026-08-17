import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Singleton taxi pricing document.
 * Rates are USD per km by guest tier; total = distanceKm × rate (min floor).
 */
const taxiSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    fareFor1to4: { type: Number, min: 0, default: 2.4 },
    fareFor5to7: { type: Number, min: 0, default: 2.4 },
    fareFor8to10: { type: Number, min: 0, default: 4 },
    fareFor1Guest: { type: Number, required: true, min: 0, default: 2.4 },
    fareFor2Guests: { type: Number, required: true, min: 0, default: 2.4 },
    fareFor3Guests: { type: Number, required: true, min: 0, default: 2.4 },
    fareFor4PlusGuests: { type: Number, required: true, min: 0, default: 4 },
    /** Legacy field — fare is tier $/km × distance; kept for compatibility. */
    perKmUsd: { type: Number, required: true, min: 0, default: 0 },
    minimumFareUsd: { type: Number, required: true, min: 0, default: 5 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type TaxiSettingsRecord = InferSchemaType<typeof taxiSettingsSchema>;
export const TaxiSettings = model<TaxiSettingsRecord>("TaxiSettings", taxiSettingsSchema);
