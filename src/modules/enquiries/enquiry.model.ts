import { Schema, model, type InferSchemaType } from "mongoose";

const enquirySchema = new Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      index: true,
    },
    phone: { type: String, trim: true, maxlength: 40 },
    interestedIn: {
      type: String,
      enum: ["Apartment Stay", "Taxi Service", "Both", "Other"],
      required: true,
      index: true,
    },
    preferredDate: { type: Date },
    preferredDateEnd: { type: Date },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ["new", "responded", "closed"],
      default: "new",
      required: true,
      index: true,
    },
    adminNotes: { type: String, trim: true, maxlength: 3000 },
    respondedAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

enquirySchema.index({ status: 1, createdAt: -1 });

export type EnquiryRecord = InferSchemaType<typeof enquirySchema>;
export const Enquiry = model<EnquiryRecord>("Enquiry", enquirySchema);
