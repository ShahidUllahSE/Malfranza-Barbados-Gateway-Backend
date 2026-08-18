import { Types } from "mongoose";
import { AppError } from "../../middleware/error-handler.js";
import { createUserNotification } from "../notifications/user-notification.service.js";
import { sendGuestRefundStatusEmail } from "../notifications/email.service.js";
import { Booking } from "./booking.model.js";
import { TaxiBooking } from "../taxi/taxi.model.js";
import {
  formatPayoutSummary,
  type AdminRefundListQuery,
  type AdminUpdateRefundInput,
} from "./cancellation.js";

export type AdminRefundItem = {
  id: string;
  kind: "stay" | "taxi";
  bookingReference: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  title: string;
  eventDate: string;
  totalPaid: number;
  refundPercent: number;
  refundAmount: number;
  refundStatus: string;
  refundPayout: Record<string, unknown> | null;
  refundAdminNote: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  refundRequestedAt: string | null;
  refundReviewedAt: string | null;
  refundProcessedAt: string | null;
  paymentStatus: string;
  href: string;
};

function mapStay(booking: any): AdminRefundItem {
  return {
    id: String(booking._id),
    kind: "stay",
    bookingReference: booking.bookingReference,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestPhone: booking.guestPhone,
    title: booking.unitName
      ? `${booking.apartmentName} · ${booking.unitName}`
      : booking.apartmentName,
    eventDate: String(booking.checkIn).slice(0, 10),
    totalPaid: Number(booking.totalAmount),
    refundPercent: Number(booking.refundPercent ?? 0),
    refundAmount: Number(booking.refundAmount ?? 0),
    refundStatus: booking.refundStatus ?? "none",
    refundPayout: booking.refundPayout ?? null,
    refundAdminNote: booking.refundAdminNote ?? null,
    cancellationReason: booking.cancellationReason ?? null,
    cancelledAt: booking.cancelledAt ? String(booking.cancelledAt) : null,
    refundRequestedAt: booking.refundRequestedAt ? String(booking.refundRequestedAt) : null,
    refundReviewedAt: booking.refundReviewedAt ? String(booking.refundReviewedAt) : null,
    refundProcessedAt: booking.refundProcessedAt ? String(booking.refundProcessedAt) : null,
    paymentStatus: booking.paymentStatus,
    href: "/admin/bookings",
  };
}

function mapTaxi(booking: any): AdminRefundItem {
  return {
    id: String(booking._id),
    kind: "taxi",
    bookingReference: booking.bookingReference,
    guestName: booking.customerName,
    guestEmail: booking.customerEmail,
    guestPhone: booking.customerPhone,
    title: booking.serviceType,
    eventDate: String(booking.pickupDate).slice(0, 10),
    totalPaid: Number(booking.estimatedFare),
    refundPercent: Number(booking.refundPercent ?? 0),
    refundAmount: Number(booking.refundAmount ?? 0),
    refundStatus: booking.refundStatus ?? "none",
    refundPayout: booking.refundPayout ?? null,
    refundAdminNote: booking.refundAdminNote ?? null,
    cancellationReason: booking.cancellationReason ?? null,
    cancelledAt: booking.cancelledAt ? String(booking.cancelledAt) : null,
    refundRequestedAt: booking.refundRequestedAt ? String(booking.refundRequestedAt) : null,
    refundReviewedAt: booking.refundReviewedAt ? String(booking.refundReviewedAt) : null,
    refundProcessedAt: booking.refundProcessedAt ? String(booking.refundProcessedAt) : null,
    paymentStatus: booking.paymentStatus,
    href: `/admin/taxi/${String(booking._id)}`,
  };
}

export async function listAdminRefunds(query: AdminRefundListQuery) {
  const refundStatusFilter =
    query.status === "all"
      ? { $in: ["eligible", "requested", "reviewing", "processed", "rejected"] as const }
      : query.status;

  const stayFilter = {
    status: "cancelled" as const,
    refundPercent: { $gt: 0 },
    refundStatus: refundStatusFilter,
  };
  const taxiFilter = {
    status: "cancelled" as const,
    refundPercent: { $gt: 0 },
    refundStatus: refundStatusFilter,
  };

  const [stays, taxis] = await Promise.all([
    query.kind === "taxi"
      ? Promise.resolve([])
      : Booking.find(stayFilter as any)
          .sort({ refundRequestedAt: -1, cancelledAt: -1 })
          .limit(500)
          .lean(),
    query.kind === "stay"
      ? Promise.resolve([])
      : TaxiBooking.find(taxiFilter as any)
          .sort({ refundRequestedAt: -1, cancelledAt: -1 })
          .limit(500)
          .lean(),
  ]);

  const items = [
    ...stays.map(mapStay),
    ...taxis.map(mapTaxi),
  ].sort((a, b) => {
    const aTime = Date.parse(a.refundRequestedAt || a.cancelledAt || "") || 0;
    const bTime = Date.parse(b.refundRequestedAt || b.cancelledAt || "") || 0;
    return bTime - aTime;
  });

  const counts = {
    eligible: items.filter((i) => i.refundStatus === "eligible").length,
    requested: items.filter((i) => i.refundStatus === "requested").length,
    reviewing: items.filter((i) => i.refundStatus === "reviewing").length,
    processed: items.filter((i) => i.refundStatus === "processed").length,
    rejected: items.filter((i) => i.refundStatus === "rejected").length,
    open: items.filter((i) => ["eligible", "requested", "reviewing"].includes(i.refundStatus)).length,
  };

  return { items, counts };
}

export async function updateAdminRefund(
  kind: "stay" | "taxi",
  id: string,
  input: AdminUpdateRefundInput,
) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, "Invalid refund id");

  if (kind === "stay") {
    const booking = await Booking.findById(id);
    if (!booking) throw new AppError(404, "Stay booking not found");
    if (booking.status !== "cancelled" || Number(booking.refundPercent) <= 0) {
      throw new AppError(409, "This booking has no refund to manage");
    }
    if (!["requested", "reviewing", "eligible"].includes(String(booking.refundStatus)) && input.status !== "processed") {
      if (booking.refundStatus === "processed" || booking.refundStatus === "rejected") {
        throw new AppError(409, `Refund is already ${booking.refundStatus}`);
      }
    }
    if (input.status === "reviewing" && !["requested", "eligible", "reviewing"].includes(String(booking.refundStatus))) {
      throw new AppError(409, "Only open refund requests can be marked in review");
    }
    if (input.status === "processed" && !["requested", "reviewing"].includes(String(booking.refundStatus))) {
      throw new AppError(409, "Guest must submit payout details before you mark a refund as processed");
    }
    if (input.status === "rejected" && !["requested", "reviewing", "eligible"].includes(String(booking.refundStatus))) {
      throw new AppError(409, "This refund cannot be rejected");
    }

    booking.refundStatus = input.status;
    booking.refundAdminNote = input.adminNote?.trim() || booking.refundAdminNote;
    if (input.status === "reviewing") booking.refundReviewedAt = new Date();
    if (input.status === "processed") {
      booking.refundProcessedAt = new Date();
      if (booking.paymentStatus === "paid") booking.paymentStatus = "refunded";
    }
    await booking.save();

    await notifyGuestRefundUpdate({
      userId: booking.userId ? String(booking.userId) : null,
      email: booking.guestEmail,
      name: booking.guestName,
      bookingReference: booking.bookingReference,
      kind: "stay",
      status: input.status,
      amount: Number(booking.refundAmount),
      adminNote: booking.refundAdminNote ?? undefined,
      payoutSummary: formatPayoutSummary(booking.refundPayout as any),
      href: `/my-bookings/${encodeURIComponent(booking.bookingReference)}`,
      entityId: String(booking._id),
    });

    return mapStay(booking.toObject());
  }

  const booking = await TaxiBooking.findById(id);
  if (!booking) throw new AppError(404, "Taxi booking not found");
  if (booking.status !== "cancelled" || Number(booking.refundPercent) <= 0) {
    throw new AppError(409, "This trip has no refund to manage");
  }
  if (input.status === "reviewing" && !["requested", "eligible", "reviewing"].includes(String(booking.refundStatus))) {
    throw new AppError(409, "Only open refund requests can be marked in review");
  }
  if (input.status === "processed" && !["requested", "reviewing"].includes(String(booking.refundStatus))) {
    throw new AppError(409, "Guest must submit payout details before you mark a refund as processed");
  }
  if (input.status === "rejected" && !["requested", "reviewing", "eligible"].includes(String(booking.refundStatus))) {
    throw new AppError(409, "This refund cannot be rejected");
  }

  booking.refundStatus = input.status;
  booking.refundAdminNote = input.adminNote?.trim() || booking.refundAdminNote;
  if (input.status === "reviewing") booking.refundReviewedAt = new Date();
  if (input.status === "processed") {
    booking.refundProcessedAt = new Date();
  }
  await booking.save();

  await notifyGuestRefundUpdate({
    userId: booking.userId ? String(booking.userId) : null,
    email: booking.customerEmail,
    name: booking.customerName,
    bookingReference: booking.bookingReference,
    kind: "taxi",
    status: input.status,
    amount: Number(booking.refundAmount),
    adminNote: booking.refundAdminNote ?? undefined,
    payoutSummary: formatPayoutSummary(booking.refundPayout as any),
    href: "/my-bookings",
    entityId: String(booking._id),
  });

  return mapTaxi(booking.toObject());
}

async function notifyGuestRefundUpdate(input: {
  userId: string | null;
  email: string;
  name: string;
  bookingReference: string;
  kind: "stay" | "taxi";
  status: "reviewing" | "processed" | "rejected";
  amount: number;
  adminNote?: string;
  payoutSummary?: string;
  href: string;
  entityId: string;
}) {
  const title =
    input.status === "processed"
      ? "Refund processed"
      : input.status === "rejected"
        ? "Refund request update"
        : "Refund in review";
  const body =
    input.status === "processed"
      ? `Your $${input.amount.toFixed(2)} refund for ${input.bookingReference} has been marked as processed.`
      : input.status === "rejected"
        ? `Your refund request for ${input.bookingReference} was not approved.${input.adminNote ? ` ${input.adminNote}` : ""}`
        : `Your $${input.amount.toFixed(2)} refund for ${input.bookingReference} is being reviewed.`;

  await sendGuestRefundStatusEmail({
    to: input.email,
    name: input.name,
    bookingReference: input.bookingReference,
    kind: input.kind,
    status: input.status,
    amount: input.amount,
    adminNote: input.adminNote,
    payoutSummary: input.payoutSummary,
  }).catch((error) => {
    console.error("[email] Failed to send guest refund status email", error);
  });

  if (!input.userId) return;
  await createUserNotification({
    userId: input.userId,
    type: input.kind === "stay" ? "stay" : "taxi",
    title,
    body,
    href: input.href,
    entityId: input.entityId,
  }).catch((error) => {
    console.error("[notify] Failed to create guest refund status notification", error);
  });
}
