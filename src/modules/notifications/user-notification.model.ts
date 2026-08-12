import { Schema, model, type InferSchemaType } from "mongoose";

const userNotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, trim: true, maxlength: 40, default: "taxi" },
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

userNotificationSchema.index({ userId: 1, createdAt: -1 });
userNotificationSchema.index({ userId: 1, readAt: 1 });

export type UserNotificationRecord = InferSchemaType<typeof userNotificationSchema>;
export const UserNotification = model<UserNotificationRecord>(
  "UserNotification",
  userNotificationSchema,
);
