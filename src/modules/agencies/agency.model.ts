import { Schema, model, type InferSchemaType } from "mongoose";

const travelAgencySchema = new Schema(
  {
    agencyName: { type: String, required: true, trim: true, maxlength: 160 },
    contactName: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      index: true,
    },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    passwordHash: { type: String, required: true, select: false },
    /**
     * Auto-generated unique booking/affiliate code (never assigned by hand).
     * Format: AG-XXXXXXXX
     */
    agencyCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    /** Default 10% — stored so historical rates could differ later. */
    commissionRate: { type: Number, required: true, min: 0, max: 1, default: 0.1 },
    isActive: { type: Boolean, default: true, required: true },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type TravelAgencyRecord = InferSchemaType<typeof travelAgencySchema>;
export const TravelAgency = model<TravelAgencyRecord>("TravelAgency", travelAgencySchema);

/** Fixed platform commission for agency-sourced stays (stay subtotal only). */
export const AGENCY_COMMISSION_RATE = 0.1;
