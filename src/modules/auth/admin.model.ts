import { Schema, model, type InferSchemaType } from "mongoose";

const adminSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["admin", "staff"],
      default: "admin",
      required: true,
    },
    isActive: { type: Boolean, default: true, required: true },
    lastLoginAt: { type: Date },
    deletedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type AdminRecord = InferSchemaType<typeof adminSchema>;
export const Admin = model<AdminRecord>("Admin", adminSchema);
