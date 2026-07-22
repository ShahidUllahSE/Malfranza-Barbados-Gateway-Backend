import { Schema, model, type InferSchemaType } from "mongoose";

const apartmentUnitSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },
    bedrooms: { type: Number, required: true, min: 1, max: 10 },
    bathrooms: { type: Number, required: true, min: 1, max: 10 },
    maxGuests: { type: Number, required: true, min: 1, max: 20 },
    pricePerNight: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, required: true, default: true },
  },
  { _id: true, versionKey: false },
);

const apartmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    subtitle: { type: String, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    type: {
      type: String,
      enum: ["one-bedroom", "two-bedroom", "three-bedroom"],
      required: true,
      index: true,
    },
    pricePerNight: { type: Number, required: true, min: 0 },
    maxGuests: { type: Number, required: true, min: 1, max: 20 },
    bedrooms: { type: Number, required: true, min: 1, max: 10 },
    bathrooms: { type: Number, required: true, min: 1, max: 10 },
    sizeSqM: { type: Number, min: 1 },
    amenities: {
      type: [{ type: String, trim: true, maxlength: 80 }],
      default: [],
    },
    photos: {
      type: [{ type: String, trim: true, maxlength: 2000 }],
      default: [],
    },
    units: {
      type: [apartmentUnitSchema],
      default: [],
      validate: {
        validator: (units: unknown[]) => units.length <= 20,
        message: "An apartment can have at most 20 bookable units",
      },
    },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

apartmentSchema.index({ isActive: 1, type: 1, pricePerNight: 1 });

export type ApartmentRecord = InferSchemaType<typeof apartmentSchema>;
export const Apartment = model<ApartmentRecord>("Apartment", apartmentSchema);
