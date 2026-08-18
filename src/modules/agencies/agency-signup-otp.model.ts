import { Schema, model, type InferSchemaType } from "mongoose";

/** Pending travel-agent signup awaiting email OTP. Removed after verify or TTL expiry. */
const agencySignupOtpSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      index: true,
    },
    agencyName: { type: String, required: true, trim: true, maxlength: 160 },
    contactName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    passwordHash: { type: String, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, required: true, default: 0 },
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

agencySignupOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AgencySignupOtpRecord = InferSchemaType<typeof agencySignupOtpSchema>;
export const AgencySignupOtp = model<AgencySignupOtpRecord>(
  "AgencySignupOtp",
  agencySignupOtpSchema,
);
