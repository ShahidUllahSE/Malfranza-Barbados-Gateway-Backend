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
    cancelledAt: { type: Date },
    cancelledBy: { type: String, enum: ["guest", "admin"] },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    refundPercent: { type: Number, min: 0, max: 100, default: 0 },
    refundAmount: { type: Number, min: 0, default: 0 },
    refundStatus: {
      type: String,
      enum: ["none", "eligible", "requested", "reviewing", "processed", "rejected"],
      default: "none",
      index: true,
    },
    refundPayout: {
      method: { type: String, enum: ["paypal", "bank", "other"] },
      accountName: { type: String, trim: true, maxlength: 120 },
      paypalEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
      bankName: { type: String, trim: true, maxlength: 120 },
      accountNumber: { type: String, trim: true, maxlength: 80 },
      routingOrSortCode: { type: String, trim: true, maxlength: 40 },
      notes: { type: String, trim: true, maxlength: 500 },
    },
    refundRequestedAt: { type: Date },
    refundReviewedAt: { type: Date },
    refundProcessedAt: { type: Date },
    refundAdminNote: { type: String, trim: true, maxlength: 1000 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

taxiBookingSchema.index({ status: 1, pickupDate: 1 });

export type TaxiBookingRecord = InferSchemaType<typeof taxiBookingSchema>;
export const TaxiBooking = model<TaxiBookingRecord>("TaxiBooking", taxiBookingSchema);
