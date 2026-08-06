import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Singleton taxi pricing document.
 * Fares are primarily by guest count; distance is an optional add-on.
 */
const taxiSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    fareFor1Guest: { type: Number, required: true, min: 0, default: 25 },
    fareFor2Guests: { type: Number, required: true, min: 0, default: 30 },
    fareFor3Guests: { type: Number, required: true, min: 0, default: 35 },
    fareFor4PlusGuests: { type: Number, required: true, min: 0, default: 45 },
    /** Added on top of the guest fare for every km of the route. Set 0 for flat guest-only pricing. */
    perKmUsd: { type: Number, required: true, min: 0, default: 2.5 },
    minimumFareUsd: { type: Number, required: true, min: 0, default: 20 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type TaxiSettingsRecord = InferSchemaType<typeof taxiSettingsSchema>;
export const TaxiSettings = model<TaxiSettingsRecord>("TaxiSettings", taxiSettingsSchema);
