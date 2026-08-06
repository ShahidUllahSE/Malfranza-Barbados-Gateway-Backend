import { Schema, model, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true, maxlength: 40 },
    /** How the account was created — guest_booking accounts get a temporary password emailed. */
    accountSource: {
      type: String,
      enum: ["self", "guest_booking"],
      default: "self",
      required: true,
    },
    mustChangePassword: { type: Boolean, default: false, required: true },
    isActive: { type: Boolean, default: true, required: true },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type UserRecord = InferSchemaType<typeof userSchema>;
export const User = model<UserRecord>("User", userSchema);
