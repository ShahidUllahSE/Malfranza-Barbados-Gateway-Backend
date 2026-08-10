import { Schema, model, type InferSchemaType } from "mongoose";

const taxiAddonSchema = new Schema(
  {
    pickup: { type: String, required: true, trim: true },
    dropoff: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    time: { type: String, required: true, trim: true },
    passengers: { type: Number, required: true, min: 1, max: 14 },
    distanceKm: { type: Number, required: true, min: 0 },
    fare: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    bookingReference: { type: String, required: true, unique: true, index: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    apartmentId: {
      type: Schema.Types.ObjectId,
      ref: "Apartment",
      required: true,
      index: true,
    },
    unitId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
    // All units covered by this booking (supports booking several units at once).
    unitIds: {
      type: [Schema.Types.ObjectId],
      default: undefined,
      index: true,
    },
    unitName: { type: String, trim: true, maxlength: 500 },
    apartmentName: { type: String, required: true, trim: true, maxlength: 160 },
    nightlyRate: { type: Number, required: true, min: 0 },
    guestName: { type: String, required: true, trim: true, maxlength: 120 },
    guestEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      index: true,
    },
    guestPhone: { type: String, required: true, trim: true, maxlength: 40 },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    guests: { type: Number, required: true, min: 1 },
    nights: { type: Number, required: true, min: 1 },
    staySubtotal: { type: Number, required: true, min: 0 },
    serviceFee: { type: Number, required: true, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    specialRequests: { type: String, trim: true, maxlength: 2000 },
    taxi: { type: taxiAddonSchema, default: undefined },
    status: {
      type: String,
      enum: ["pending", "confirmed", "checked_in", "checked_out", "cancelled"],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "refunded"],
      default: "unpaid",
      index: true,
    },
    paymentReference: { type: String, trim: true },
    /** Travel-agency attribution (optional). Code is validated at booking time. */
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: "TravelAgency",
      index: true,
    },
    agencyCode: { type: String, trim: true, uppercase: true, maxlength: 40, index: true },
    agencyName: { type: String, trim: true, maxlength: 160 },
    /** Snapshot of rate used when booking was placed (usually 10%). */
    commissionRate: { type: Number, min: 0, max: 1 },
    /** 10% of stay subtotal when agency-sourced (excludes taxi). */
    commissionAmount: { type: Number, min: 0, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

bookingSchema.index({ apartmentId: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ apartmentId: 1, unitId: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ agencyCode: 1, checkIn: 1 });

export type BookingRecord = InferSchemaType<typeof bookingSchema>;
export const Booking = model<BookingRecord>("Booking", bookingSchema);

const bookingLockSchema = new Schema(
  {
    apartmentId: {
      type: Schema.Types.ObjectId,
      ref: "Apartment",
      required: true,
      unique: true,
    },
    revision: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

type BookingLockRecord = InferSchemaType<typeof bookingLockSchema>;
export const BookingLock = model<BookingLockRecord>("BookingLock", bookingLockSchema);
