import { Schema, model, type InferSchemaType } from "mongoose";

const driverSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    passwordHash: { type: String, required: true, select: false },
    vehicleLabel: { type: String, trim: true, maxlength: 120 },
    passengerCapacity: { type: Number, required: true, min: 1, max: 20, default: 4 },
    isAvailable: { type: Boolean, default: true, required: true, index: true },
    isActive: { type: Boolean, default: true, required: true, index: true },
    lastLoginAt: { type: Date },
    deletedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type DriverRecord = InferSchemaType<typeof driverSchema>;
export const Driver = model<DriverRecord>("Driver", driverSchema);
