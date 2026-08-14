import { Schema, model, type InferSchemaType } from "mongoose";

export const ADMIN_NOTIFICATION_TYPES = [
  "taxi_booking",
  "stay_booking",
  "enquiry",
  "agency_signup",
  "refund_request",
] as const;

export type AdminNotificationType = (typeof ADMIN_NOTIFICATION_TYPES)[number];

const adminNotificationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ADMIN_NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    href: { type: String, required: true, trim: true, maxlength: 300 },
    entityId: { type: String, trim: true, maxlength: 40, index: true },
    readAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

adminNotificationSchema.index({ createdAt: -1 });
adminNotificationSchema.index({ readAt: 1, createdAt: -1 });

export type AdminNotificationRecord = InferSchemaType<typeof adminNotificationSchema>;
export const AdminNotification = model<AdminNotificationRecord>(
  "AdminNotification",
  adminNotificationSchema,
);
