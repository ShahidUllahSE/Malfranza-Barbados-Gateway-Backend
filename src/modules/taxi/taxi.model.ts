import { Schema, model, type InferSchemaType } from "mongoose";

const taxiBookingSchema = new Schema(
  {
    bookingReference: { type: String, required: true, unique: true, index: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    serviceType: {
      type: String,
      enum: ["Airport Pickup", "Airport Drop-off", "Point to Point", "Hourly / Custom"],
      required: true,
    },
    pickupLocation: { type: String, required: true, trim: true, maxlength: 300 },
    dropoffLocation: { type: String, required: true, trim: true, maxlength: 300 },
    pickupDate: { type: Date, required: true, index: true },
    pickupTime: { type: String, required: true, trim: true },
    passengers: { type: Number, required: true, min: 1, max: 14 },
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    customerEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      index: true,
    },
    customerPhone: { type: String, required: true, trim: true, maxlength: 40 },
    notes: { type: String, trim: true, maxlength: 2000 },
    distanceKm: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, min: 0 },
    estimatedFare: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["USD"], default: "USD", required: true },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
      required: true,
      index: true,
    },
    paymentReference: { type: String, trim: true, maxlength: 120 },
    paymentMethod: { type: String, trim: true, maxlength: 40 },
    status: {
      type: String,
      enum: ["pending", "confirmed", "assigned", "en_route", "completed", "cancelled"],
      default: "pending",
      required: true,
      index: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      index: true,
    },
    assignedAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

taxiBookingSchema.index({ status: 1, pickupDate: 1 });

export type TaxiBookingRecord = InferSchemaType<typeof taxiBookingSchema>;
export const TaxiBooking = model<TaxiBookingRecord>("TaxiBooking", taxiBookingSchema);
