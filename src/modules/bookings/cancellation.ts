import { z } from "zod";

export const REFUND_WINDOW_DAYS = 7;
export const REFUND_PERCENT = 50;

export const REFUND_STATUSES = [
  "none",
  "eligible",
  "requested",
  "reviewing",
  "processed",
  "rejected",
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const refundPayoutSchema = z
  .object({
    method: z.enum(["paypal", "bank", "other"]),
    accountName: z.string().trim().min(2).max(120),
    paypalEmail: z.email().max(254).optional(),
    bankName: z.string().trim().min(2).max(120).optional(),
    accountNumber: z.string().trim().min(4).max(80).optional(),
    routingOrSortCode: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.method === "paypal" && !value.paypalEmail) {
      ctx.addIssue({
        code: "custom",
        path: ["paypalEmail"],
        message: "Enter the PayPal email for your refund",
      });
    }
    if (value.method === "bank") {
      if (!value.bankName) {
        ctx.addIssue({
          code: "custom",
          path: ["bankName"],
          message: "Enter the bank name",
        });
      }
      if (!value.accountNumber) {
        ctx.addIssue({
          code: "custom",
          path: ["accountNumber"],
          message: "Enter the account number",
        });
      }
    }
    if (value.method === "other" && !value.notes?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Describe how we should send the refund",
      });
    }
  });

export const guestCancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const guestRefundRequestSchema = z.object({
  payout: refundPayoutSchema,
});

export const adminRefundListQuerySchema = z.object({
  status: z
    .enum(["all", "eligible", "requested", "reviewing", "processed", "rejected"])
    .optional()
    .default("all"),
  kind: z.enum(["all", "stay", "taxi"]).optional().default("all"),
});

export const adminUpdateRefundSchema = z
  .object({
    status: z.enum(["reviewing", "processed", "rejected"]),
    adminNote: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "rejected" && !value.adminNote?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["adminNote"],
        message: "Add a short note when rejecting a refund",
      });
    }
  });

export const adminRefundParamSchema = z.object({
  kind: z.enum(["stay", "taxi"]),
  id: z.string().min(1),
});

export type RefundPayoutInput = z.infer<typeof refundPayoutSchema>;
export type GuestCancelBookingInput = z.infer<typeof guestCancelBookingSchema>;
export type GuestRefundRequestInput = z.infer<typeof guestRefundRequestSchema>;
export type AdminRefundListQuery = z.infer<typeof adminRefundListQuerySchema>;
export type AdminUpdateRefundInput = z.infer<typeof adminUpdateRefundSchema>;

export type CancellationPreview = {
  allowed: boolean;
  daysUntil: number;
  refundPercent: number;
  refundAmount: number;
  refundEligible: boolean;
  requiresPayoutDetails: boolean;
  message: string;
};

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function calendarDaysUntil(eventDate: Date, from = new Date()): number {
  const start = startOfUtcDay(from);
  const event = startOfUtcDay(eventDate);
  return Math.round((event.getTime() - start.getTime()) / 86_400_000);
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function evaluateCancellation(input: {
  eventDate: Date;
  paymentStatus: string;
  amount: number;
  status: string;
  kind: "stay" | "taxi";
}): CancellationPreview {
  const cancellable =
    input.kind === "stay"
      ? ["pending", "confirmed"]
      : ["pending", "confirmed", "assigned"];
  const allowed = cancellable.includes(input.status);
  const daysUntil = calendarDaysUntil(input.eventDate);
  const paid = input.paymentStatus === "paid";
  const refundPercent = allowed && paid && daysUntil >= REFUND_WINDOW_DAYS ? REFUND_PERCENT : 0;
  const refundAmount = money((Number(input.amount) || 0) * (refundPercent / 100));
  const refundEligible = refundPercent > 0 && refundAmount > 0;
  const eventWord = input.kind === "stay" ? "check-in" : "pickup";

  let message: string;
  if (!allowed) {
    message =
      input.status === "cancelled"
        ? "This booking is already cancelled."
        : "This booking can no longer be cancelled.";
  } else if (refundEligible) {
    message = `You are cancelling ${daysUntil} day${daysUntil === 1 ? "" : "s"} before ${eventWord}. You can request a 50% refund of $${refundAmount.toFixed(2)} after cancelling. Admin will process it manually.`;
  } else if (daysUntil >= REFUND_WINDOW_DAYS && !paid) {
    message = `You are cancelling 7 or more days before ${eventWord}. No payment was collected, so there is nothing to refund.`;
  } else {
    message = `Cancellations within 7 days of ${eventWord} receive no refund (0%). You can still cancel this booking.`;
  }

  return {
    allowed,
    daysUntil,
    refundPercent,
    refundAmount,
    refundEligible,
    requiresPayoutDetails: false,
    message,
  };
}

export function formatPayoutSummary(payout?: RefundPayoutInput | null): string {
  if (!payout) return "";
  if (payout.method === "paypal") {
    return `PayPal · ${payout.accountName} · ${payout.paypalEmail ?? ""}`.trim();
  }
  if (payout.method === "bank") {
    return [
      "Bank",
      payout.accountName,
      payout.bankName,
      payout.accountNumber,
      payout.routingOrSortCode,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return [`Other · ${payout.accountName}`, payout.notes].filter(Boolean).join(" · ");
}

export function refundStatusLabel(status?: string | null) {
  switch (status) {
    case "eligible":
      return "Awaiting guest request";
    case "requested":
      return "Requested";
    case "reviewing":
      return "In review";
    case "processed":
      return "Processed";
    case "rejected":
      return "Rejected";
    default:
      return "None";
  }
}
