import { randomBytes } from "node:crypto";
import mongoose, { Types, type ClientSession, type QueryFilter } from "mongoose";
import { AppError } from "../../middleware/error-handler.js";
import { Apartment } from "../apartments/apartment.model.js";
import {
  type PricedRoomType,
  roomTypeFromBedrooms,
  staySubtotal,
  staySubtotalForUnits,
  combinedNightlyForUnits,
  catalogFromRate,
  listingFromRate,
} from "../apartments/pricing.js";
import {
  AGENCY_COMMISSION_RATE,
} from "../agencies/agency.model.js";
import { getDefaultCommissionRate } from "../agencies/agency-settings.service.js";
import { findActiveAgencyByCode } from "../agencies/agency.service.js";
import {
  sendAdminBookingChangedEmail,
  sendStayStatusEmail,
} from "../notifications/email.service.js";
import { createAdminNotification } from "../notifications/admin-notification.service.js";
import { createUserNotification } from "../notifications/user-notification.service.js";
import { Booking, BookingLock, type BookingRecord } from "./booking.model.js";
import {
  evaluateCancellation,
  formatPayoutSummary,
  type GuestCancelBookingInput,
  type GuestRefundRequestInput,
} from "./cancellation.js";
import type {
  AdminBookingListQuery,
  AvailabilityQuery,
  CreateBookingInput,
} from "./booking.validation.js";

const BLOCKING_STATUSES = ["pending", "confirmed", "checked_in"] as const;

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function calculateNights(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function generateBookingReference(): string {
  const year = new Date().getUTCFullYear();
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  return `MFZ-${year}-${suffix}`;
}

/**
 * @param treatAsWholeApartment — exclusive inventory (1-BR vs 2-BR config): any stay blocks all configs.
 */
async function findConflict(
  apartmentId: Types.ObjectId,
  checkIn: Date,
  checkOut: Date,
  unitIds?: Types.ObjectId[],
  session?: ClientSession,
  treatAsWholeApartment = false,
): Promise<boolean> {
  const filter: QueryFilter<BookingRecord> = {
    apartmentId,
    status: { $in: BLOCKING_STATUSES },
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
  };
  if (!treatAsWholeApartment && unitIds && unitIds.length > 0) {
    filter.$or = [
      { unitId: { $in: unitIds } },
      { unitIds: { $in: unitIds } },
      // A whole-apartment booking (no unit info at all) blocks every unit.
      {
        $and: [
          { $or: [{ unitId: { $exists: false } }, { unitId: null }] },
          { $or: [{ unitIds: { $exists: false } }, { unitIds: { $size: 0 } }] },
        ],
      },
    ];
  }
  const query = Booking.exists(filter);

  if (session) query.session(session);
  return (await query) !== null;
}

/** True when the booking blocks the given unit (covers legacy shapes). */
function bookingBlocksUnit(
  booking: { unitId?: unknown; unitIds?: unknown[] | null },
  unitId: string,
  /** Exclusive parent inventory: any booking on the property blocks every config. */
  exclusive = false,
): boolean {
  if (exclusive) return true;
  const ids = Array.isArray(booking.unitIds) ? booking.unitIds.map(String) : [];
  if (booking.unitId) ids.push(String(booking.unitId));
  // No unit info at all means the whole apartment is booked.
  if (ids.length === 0) return true;
  return ids.includes(unitId);
}

async function ensureBookingLock(apartmentId: Types.ObjectId): Promise<void> {
  try {
    await BookingLock.updateOne(
      { apartmentId },
      { $setOnInsert: { apartmentId, revision: 0 } },
      { upsert: true },
    );
  } catch (error: unknown) {
    const duplicateKey = typeof error === "object" && error !== null && "code" in error && error.code === 11000;
    if (!duplicateKey) throw error;
  }
}

export async function checkAvailability(input: AvailabilityQuery): Promise<boolean> {
  const apartmentId = new Types.ObjectId(input.apartmentId);
  const apartment = await Apartment.findOne({ _id: apartmentId, isActive: true });
  if (!apartment) throw new AppError(404, "Apartment not found");

  const exclusive = apartment.unitsExclusive === true;
  let selectedUnitIds: Types.ObjectId[] | undefined;
  if (apartment.units.length > 0) {
    const requested = input.unitIds ?? (input.unitId ? [input.unitId] : []);
    if (requested.length === 0) throw new AppError(400, "Select a unit for this apartment");
    selectedUnitIds = requested.map((id) => {
      const unit = apartment.units.id(id);
      if (!unit || !unit.isActive) throw new AppError(404, "Apartment unit not found");
      return new Types.ObjectId(id);
    });
    if (exclusive && selectedUnitIds.length > 1) {
      throw new AppError(400, "This apartment can only be booked as one configuration at a time");
    }
  }

  return !(await findConflict(
    apartmentId,
    toUtcDate(input.checkIn),
    toUtcDate(input.checkOut),
    selectedUnitIds,
    undefined,
    exclusive,
  ));
}

export async function listApartmentOccupancy(input: {
  checkIn?: string;
  checkOut?: string;
}) {
  const apartments = await Apartment.find({ isActive: true })
    .select("_id slug name subtitle units unitsExclusive type bedrooms pricePerNight")
    .lean();

  const today = toUtcDate(new Date().toISOString().slice(0, 10));
  const hasSearchDates = Boolean(input.checkIn && input.checkOut);
  const searchStart = hasSearchDates ? toUtcDate(input.checkIn!) : today;
  const searchEnd = hasSearchDates
    ? toUtcDate(input.checkOut!)
    : new Date(today.getTime() + 86_400_000);

  // Always load upcoming/current blocking stays for badge display (next ~6 months)
  const displayEnd = new Date(today.getTime() + 180 * 86_400_000);

  const blocking = await Booking.find({
    status: { $in: BLOCKING_STATUSES },
    checkOut: { $gt: today },
    checkIn: { $lt: displayEnd },
  })
    .select("apartmentId unitId unitIds unitName checkIn checkOut status")
    .sort({ checkIn: 1 })
    .lean();

  const byApartment = new Map<string, typeof blocking>();
  for (const booking of blocking) {
    const key = String(booking.apartmentId);
    const list = byApartment.get(key) ?? [];
    list.push(booking);
    byApartment.set(key, list);
  }

  return apartments.map((apartment) => {
    const key = String(apartment._id);
    const ranges = byApartment.get(key) ?? [];
    const exclusive = apartment.unitsExclusive === true;
    const current = ranges.find(
      (booking) => booking.checkIn <= today && booking.checkOut > today,
    );
    const next = ranges.find((booking) => booking.checkIn > today);
    const conflictsSearch = ranges.filter(
      (booking) => booking.checkIn < searchEnd && booking.checkOut > searchStart,
    );
    const availableForRequest = hasSearchDates
      ? conflictsSearch.length === 0
      : !current;

    const fromRate = listingFromRate({
      type: apartment.type,
      pricePerNight: apartment.pricePerNight,
      units: apartment.units,
    });

    return {
      apartmentId: key,
      slug: apartment.slug,
      name: apartment.name,
      subtitle: apartment.subtitle ?? null,
      unitsExclusive: exclusive,
      available: apartment.units.length > 0
        ? apartment.units.some((unit) => {
            if (!unit.isActive) return false;
            return !conflictsSearch.some(
              (booking) => bookingBlocksUnit(booking, String(unit._id), exclusive),
            );
          })
        : availableForRequest,
      occupiedNow: !!current,
      currentBooking: current
        ? {
            checkIn: current.checkIn.toISOString().slice(0, 10),
            checkOut: current.checkOut.toISOString().slice(0, 10),
            status: current.status,
          }
        : null,
      nextBooking: next
        ? {
            checkIn: next.checkIn.toISOString().slice(0, 10),
            checkOut: next.checkOut.toISOString().slice(0, 10),
            status: next.status,
          }
        : null,
      blockedRanges: ranges.map((booking) => ({
        checkIn: booking.checkIn.toISOString().slice(0, 10),
        checkOut: booking.checkOut.toISOString().slice(0, 10),
        status: booking.status,
        unitId: booking.unitId ? String(booking.unitId) : null,
        unitName: booking.unitName ?? null,
      })),
      units: apartment.units.map((unit) => {
        const unitRanges = ranges.filter(
          (booking) => bookingBlocksUnit(booking, String(unit._id), exclusive),
        );
        const unitCurrent = unitRanges.find(
          (booking) => booking.checkIn <= today && booking.checkOut > today,
        );
        const unitConflicts = unitRanges.some(
          (booking) => booking.checkIn < searchEnd && booking.checkOut > searchStart,
        );
        const unitRoomType = roomTypeFromBedrooms(unit.bedrooms);
        return {
          id: String(unit._id),
          name: unit.name,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          maxGuests: unit.maxGuests,
          pricePerNight: catalogFromRate(unitRoomType),
          isActive: unit.isActive,
          available: unit.isActive && (hasSearchDates ? !unitConflicts : !unitCurrent),
          occupiedNow: !!unitCurrent,
          blockedRanges: unitRanges.map((booking) => ({
            checkIn: booking.checkIn.toISOString().slice(0, 10),
            checkOut: booking.checkOut.toISOString().slice(0, 10),
            status: booking.status,
          })),
        };
      }),
      fromRate,
    };
  });
}

export async function createBooking(input: CreateBookingInput, userId?: string) {
  const apartmentId = new Types.ObjectId(input.apartmentId);
  const checkIn = toUtcDate(input.checkIn);
  const checkOut = toUtcDate(input.checkOut);
  const nights = calculateNights(checkIn, checkOut);
  const checkInIso = input.checkIn.slice(0, 10);
  const checkOutIso = input.checkOut.slice(0, 10);

  await ensureBookingLock(apartmentId);

  const session = await mongoose.startSession();

  try {
    const createdBooking = await session.withTransaction(async () => {
      await BookingLock.updateOne({ apartmentId }, { $inc: { revision: 1 } }, { session });

      const apartment = await Apartment.findOne({ _id: apartmentId, isActive: true }).session(session);
      if (!apartment) {
        throw new AppError(404, "Apartment not found");
      }
      if (input.guests > apartment.maxGuests) {
        throw new AppError(400, `This apartment allows a maximum of ${apartment.maxGuests} guests`);
      }

      const exclusive = apartment.unitsExclusive === true;

      type SelectedUnit = {
        _id: Types.ObjectId;
        name: string;
        maxGuests: number;
        pricePerNight: number;
        bedrooms: number;
        isActive: boolean;
      };
      let selectedUnits: SelectedUnit[] = [];
      if (apartment.units.length > 0) {
        const requestedIds = [...new Set(input.unitIds ?? (input.unitId ? [input.unitId] : []))];
        if (requestedIds.length === 0) {
          throw new AppError(400, "Select at least one unit for this apartment");
        }
        if (exclusive && requestedIds.length > 1) {
          throw new AppError(
            400,
            "Choose either the one-bedroom or two-bedroom configuration — not both",
          );
        }
        selectedUnits = requestedIds.map((id) => {
          const unit = apartment.units.id(id);
          if (!unit || !unit.isActive) throw new AppError(404, "Apartment unit not found");
          return unit;
        });
        const combinedMaxGuests = exclusive
          ? selectedUnits[0]!.maxGuests
          : selectedUnits.reduce((sum, unit) => sum + unit.maxGuests, 0);
        if (input.guests > combinedMaxGuests) {
          const label = selectedUnits.length === 1
            ? selectedUnits[0]!.name
            : "The selected units";
          throw new AppError(400, `${label} allow${selectedUnits.length === 1 ? "s" : ""} a maximum of ${combinedMaxGuests} guests`);
        }
      }

      const selectedUnitIds = selectedUnits.map(
        (unit) => new Types.ObjectId(String(unit._id)),
      );
      if (await findConflict(
        apartmentId,
        checkIn,
        checkOut,
        selectedUnitIds.length > 0 ? selectedUnitIds : undefined,
        session,
        exclusive,
      )) {
        throw new AppError(
          409,
          exclusive
            ? "This apartment is unavailable for the selected dates (its one- and two-bedroom options share inventory)"
            : selectedUnits.length === 1
              ? `${selectedUnits[0]!.name} is unavailable for the selected dates`
              : selectedUnits.length > 1
                ? "One or more of the selected units are unavailable for the selected dates"
                : "The apartment is unavailable for the selected dates",
        );
      }

      // Seasonal engine: type from unit bedroom count or apartment type.
      const pricedType: PricedRoomType =
        selectedUnits.length > 0
          ? roomTypeFromBedrooms(selectedUnits[0]!.bedrooms)
          : apartment.bedrooms >= 2
            ? "two-bedroom"
            : "one-bedroom";

      const staySubtotalAmount = money(
        selectedUnits.length > 0
          ? staySubtotalForUnits(selectedUnits, checkInIso, checkOutIso)
          : staySubtotal(pricedType, checkInIso, checkOutIso),
      );
      const nightlyRate =
        nights > 0
          ? money(staySubtotalAmount / nights)
          : selectedUnits.length > 0
            ? combinedNightlyForUnits(selectedUnits)
            : catalogFromRate(pricedType);
      const serviceFee = 0;
      const totalAmount = money(staySubtotalAmount + serviceFee + (input.taxi?.fare ?? 0));

      let agencyAttribution:
        | {
            agencyId: Types.ObjectId;
            agencyCode: string;
            agencyName: string;
            commissionRate: number;
            commissionAmount: number;
          }
        | undefined;

      if (input.agencyCode) {
        const agency = await findActiveAgencyByCode(input.agencyCode);
        if (!agency) {
          throw new AppError(400, "Invalid or inactive travel agency code");
        }
        const fallbackRate = await getDefaultCommissionRate();
        const rate = Number(agency.commissionRate ?? fallbackRate ?? AGENCY_COMMISSION_RATE);
        agencyAttribution = {
          agencyId: agency._id as Types.ObjectId,
          agencyCode: agency.agencyCode,
          agencyName: agency.agencyName,
          commissionRate: rate,
          // Commission on stay (room nights) only — taxi is excluded.
          commissionAmount: money(staySubtotalAmount * rate),
        };
      }

      const booking = new Booking({
        guestName: input.guestName,
        guestEmail: input.guestEmail.toLowerCase(),
        guestPhone: input.guestPhone,
        guests: input.guests,
        specialRequests: input.specialRequests,
        apartmentId,
        unitId: selectedUnitIds.length === 1 ? selectedUnitIds[0] : undefined,
        unitIds: selectedUnitIds.length > 0 ? selectedUnitIds : undefined,
        unitName: selectedUnits.length > 0
          ? selectedUnits.map((unit) => unit.name).join(" + ")
          : undefined,
        apartmentName: apartment.name,
        nightlyRate,
        checkIn,
        checkOut,
        nights,
        staySubtotal: staySubtotalAmount,
        serviceFee,
        totalAmount,
        bookingReference: generateBookingReference(),
        userId: userId ? new Types.ObjectId(userId) : undefined,
        status: input.status === "confirmed" ? "confirmed" : "pending",
        paymentStatus: input.paymentStatus ?? "unpaid",
        paymentReference: input.paymentReference,
        taxi: input.taxi
          ? {
              ...input.taxi,
              date: toUtcDate(input.taxi.date),
            }
          : undefined,
        ...(agencyAttribution ?? {}),
      });

      return booking.save({ session });
    });

    if (!createdBooking) {
      throw new AppError(500, "Booking could not be created");
    }

    return createdBooking;
  } finally {
    await session.endSession();
  }
}

export async function getPublicBooking(reference: string, email: string) {
  const booking = await Booking.findOne({
    bookingReference: reference.toUpperCase(),
    guestEmail: email.toLowerCase(),
  }).lean();

  if (!booking) {
    throw new AppError(404, "Booking not found");
  }

  return booking;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listBookings(input: AdminBookingListQuery) {
  const filter: QueryFilter<BookingRecord> = {};

  if (input.status) filter.status = input.status;
  if (input.paymentStatus) filter.paymentStatus = input.paymentStatus;
  if (input.fromDate) filter.checkIn = { $gte: toUtcDate(input.fromDate) };
  if (input.toDate) filter.checkOut = { $lte: toUtcDate(input.toDate) };

  if (input.search) {
    const search = new RegExp(escapeRegExp(input.search), "i");
    filter.$or = [
      { bookingReference: search },
      { guestName: search },
      { guestEmail: search },
      { agencyCode: search },
      { agencyName: search },
    ];
  }

  const skip = (input.page - 1) * input.limit;
  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(input.limit)
      .populate("userId", "name email phone")
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit),
    },
  };
}

export async function getBookingForAdmin(id: string) {
  const booking = await Booking.findById(id).lean();
  if (!booking) throw new AppError(404, "Booking not found");
  return booking;
}

const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled"],
  checked_in: ["checked_out"],
  checked_out: [],
  cancelled: [],
} as const;

export async function updateBookingStatus(
  id: string,
  nextStatus: "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled",
) {
  const booking = await Booking.findById(id);
  if (!booking) throw new AppError(404, "Booking not found");

  const previous = booking.status;
  if (booking.status !== nextStatus) {
    const allowed = STATUS_TRANSITIONS[booking.status] as readonly string[];
    if (!allowed.includes(nextStatus)) {
      throw new AppError(409, `Cannot change booking from ${booking.status} to ${nextStatus}`);
    }
    booking.status = nextStatus;
    await booking.save();
  }

  if (previous !== nextStatus && (nextStatus === "cancelled" || nextStatus === "confirmed" || nextStatus === "checked_in")) {
    const changeSummary =
      nextStatus === "cancelled"
        ? "Booking cancelled"
        : nextStatus === "confirmed"
          ? "Booking confirmed"
          : `Status updated to ${nextStatus.replaceAll("_", " ")}`;

    await sendStayStatusEmail({
      to: booking.guestEmail,
      name: booking.guestName,
      bookingReference: booking.bookingReference,
      status: nextStatus,
      apartmentName: booking.apartmentName,
      checkIn: String(booking.checkIn).slice(0, 10),
      checkOut: String(booking.checkOut).slice(0, 10),
      changeSummary,
    }).catch((error) => {
      console.error("[email] Failed to send stay status email", error);
    });

    if (nextStatus === "cancelled") {
      await sendAdminBookingChangedEmail({
        bookingReference: booking.bookingReference,
        action: "cancelled",
        summary: `${booking.apartmentName}, ${String(booking.checkIn).slice(0, 10)} → ${String(booking.checkOut).slice(0, 10)} · Guest ${booking.guestName}`,
      }).catch((error) => {
        console.error("[email] Failed to send admin booking cancel alert", error);
      });
    }
  }

  return booking;
}

const PAYMENT_TRANSITIONS = {
  unpaid: ["paid"],
  paid: ["refunded"],
  refunded: [],
} as const;

export async function updateBookingPayment(
  id: string,
  nextStatus: "unpaid" | "paid" | "refunded",
  paymentReference?: string,
) {
  const booking = await Booking.findById(id);
  if (!booking) throw new AppError(404, "Booking not found");

  if (booking.paymentStatus !== nextStatus) {
    const allowed = PAYMENT_TRANSITIONS[booking.paymentStatus] as readonly string[];
    if (!allowed.includes(nextStatus)) {
      throw new AppError(
        409,
        `Cannot change payment from ${booking.paymentStatus} to ${nextStatus}`,
      );
    }
  }

  if (nextStatus === "paid" && !paymentReference && !booking.paymentReference) {
    throw new AppError(400, "A payment reference is required when marking a booking as paid");
  }

  booking.paymentStatus = nextStatus;
  if (paymentReference) booking.paymentReference = paymentReference;
  await booking.save();

  return booking;
}

export async function cancelBooking(id: string) {
  return updateBookingStatus(id, "cancelled");
}

export async function cancelUserStayBooking(
  userId: string,
  reference: string,
  input: GuestCancelBookingInput,
) {
  const booking = await Booking.findOne({
    userId,
    bookingReference: reference.trim().toUpperCase(),
  });
  if (!booking) throw new AppError(404, "Booking not found");

  const preview = evaluateCancellation({
    eventDate: booking.checkIn,
    paymentStatus: booking.paymentStatus,
    amount: Number(booking.totalAmount),
    status: booking.status,
    kind: "stay",
  });

  if (!preview.allowed) {
    throw new AppError(
      409,
      booking.status === "cancelled"
        ? "This booking is already cancelled"
        : "This booking can no longer be cancelled",
    );
  }

  booking.status = "cancelled";
  booking.cancelledAt = new Date();
  booking.cancelledBy = "guest";
  booking.cancellationReason = input.reason?.trim() || undefined;
  booking.refundPercent = preview.refundPercent;
  booking.refundAmount = preview.refundAmount;
  booking.refundStatus = preview.refundEligible ? "eligible" : "none";
  await booking.save();

  const checkIn = String(booking.checkIn).slice(0, 10);
  const checkOut = String(booking.checkOut).slice(0, 10);
  const refundNote = preview.refundEligible
    ? `You are eligible for a 50% refund of $${preview.refundAmount.toFixed(2)}. Open My Bookings and submit a refund request with your payout details. Our team will process it manually.`
    : "This cancellation is non-refundable under our 7-day policy.";

  await sendStayStatusEmail({
    to: booking.guestEmail,
    name: booking.guestName,
    bookingReference: booking.bookingReference,
    status: "cancelled",
    apartmentName: booking.apartmentName,
    checkIn,
    checkOut,
    changeSummary: preview.refundEligible
      ? `Cancelled by guest · eligible for 50% refund ($${preview.refundAmount.toFixed(2)})`
      : "Cancelled by guest · no refund",
    refundNote,
  }).catch((error) => {
    console.error("[email] Failed to send guest stay cancel email", error);
  });

  await sendAdminBookingChangedEmail({
    bookingReference: booking.bookingReference,
    action: "cancelled",
    summary: `${booking.apartmentName}, ${checkIn} → ${checkOut} · Guest ${booking.guestName} · ${
      preview.refundEligible
        ? `eligible for 50% refund $${preview.refundAmount.toFixed(2)} (awaiting guest request)`
        : "no refund"
    }`,
    extra: [
      preview.refundEligible
        ? `Refund: 50% · $${preview.refundAmount.toFixed(2)} · guest can submit payout details`
        : "Refund: none",
      input.reason ? `Reason: ${input.reason}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    href: preview.refundEligible ? "/admin/refunds" : "/admin/bookings",
  }).catch((error) => {
    console.error("[email] Failed to send admin stay cancel alert", error);
  });

  await createAdminNotification({
    type: "stay_booking",
    title: preview.refundEligible
      ? "Guest cancelled — refund eligible"
      : "Guest cancelled stay — no refund",
    body: `${booking.guestName} · ${booking.bookingReference} · ${checkIn} → ${checkOut}${
      preview.refundEligible ? ` · $${preview.refundAmount.toFixed(2)}` : ""
    }`,
    href: preview.refundEligible ? "/admin/refunds" : "/admin/bookings",
    entityId: String(booking._id),
  }).catch((error) => {
    console.error("[notify] Failed to create admin stay cancel notification", error);
  });

  if (booking.userId) {
    await createUserNotification({
      userId: String(booking.userId),
      type: "stay",
      title: "Stay booking cancelled",
      body: preview.refundEligible
        ? `${booking.apartmentName} cancelled. Submit your refund request (50% · $${preview.refundAmount.toFixed(2)}) from My Bookings.`
        : `${booking.apartmentName} cancelled. No refund applies.`,
      href: `/my-bookings/${encodeURIComponent(booking.bookingReference)}`,
      entityId: String(booking._id),
    }).catch((error) => {
      console.error("[notify] Failed to create guest stay cancel notification", error);
    });
  }

  return booking.toObject();
}

export async function submitStayRefundRequest(
  userId: string,
  reference: string,
  input: GuestRefundRequestInput,
) {
  const booking = await Booking.findOne({
    userId,
    bookingReference: reference.trim().toUpperCase(),
  });
  if (!booking) throw new AppError(404, "Booking not found");
  if (booking.status !== "cancelled") {
    throw new AppError(409, "Cancel the booking before requesting a refund");
  }
  if (Number(booking.refundPercent) <= 0 || Number(booking.refundAmount) <= 0) {
    throw new AppError(400, "This cancellation is not eligible for a refund");
  }
  if (["requested", "reviewing", "processed"].includes(String(booking.refundStatus))) {
    throw new AppError(409, "A refund request is already in progress for this booking");
  }
  if (booking.refundStatus === "rejected") {
    throw new AppError(409, "This refund was rejected. Contact support if you need help.");
  }

  booking.refundPayout = input.payout;
  booking.refundStatus = "requested";
  booking.refundRequestedAt = new Date();
  booking.refundAdminNote = undefined;
  await booking.save();

  const payoutLine = formatPayoutSummary(input.payout);
  await sendAdminBookingChangedEmail({
    bookingReference: booking.bookingReference,
    action: "updated",
    summary: `Refund request submitted · ${booking.apartmentName} · $${Number(booking.refundAmount).toFixed(2)}`,
    extra: [`Payout: ${payoutLine}`, "Open Admin → Refunds to review and process."].join("\n"),
    href: "/admin/refunds",
  }).catch((error) => {
    console.error("[email] Failed to send admin refund request alert", error);
  });

  await createAdminNotification({
    type: "refund_request",
    title: "New stay refund request",
    body: `${booking.guestName} · ${booking.bookingReference} · $${Number(booking.refundAmount).toFixed(2)} · ${payoutLine}`,
    href: "/admin/refunds",
    entityId: String(booking._id),
  }).catch((error) => {
    console.error("[notify] Failed to create admin refund notification", error);
  });

  if (booking.userId) {
    await createUserNotification({
      userId: String(booking.userId),
      type: "stay",
      title: "Refund request submitted",
      body: `We received your request for $${Number(booking.refundAmount).toFixed(2)}. Admin will process it manually.`,
      href: `/my-bookings/${encodeURIComponent(booking.bookingReference)}`,
      entityId: String(booking._id),
    }).catch((error) => {
      console.error("[notify] Failed to create guest refund notification", error);
    });
  }

  return booking.toObject();
}
