import { Schema, model, type InferSchemaType } from "mongoose";

/** Pending signup awaiting email OTP. Removed after verify or TTL expiry. */
const signupOtpSchema = new Schema(
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
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 40 },
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

// Auto-delete expired pending signups
signupOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SignupOtpRecord = InferSchemaType<typeof signupOtpSchema>;
export const SignupOtp = model<SignupOtpRecord>("SignupOtp", signupOtpSchema);
