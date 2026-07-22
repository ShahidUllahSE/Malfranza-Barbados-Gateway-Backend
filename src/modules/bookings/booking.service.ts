import { randomBytes } from "node:crypto";
import mongoose, { Types, type ClientSession, type QueryFilter } from "mongoose";
import { AppError } from "../../middleware/error-handler.js";
import { Apartment } from "../apartments/apartment.model.js";
import { Booking, BookingLock, type BookingRecord } from "./booking.model.js";
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

async function findConflict(
  apartmentId: Types.ObjectId,
  checkIn: Date,
  checkOut: Date,
  unitIds?: Types.ObjectId[],
  session?: ClientSession,
): Promise<boolean> {
  const filter: QueryFilter<BookingRecord> = {
    apartmentId,
    status: { $in: BLOCKING_STATUSES },
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
  };
  if (unitIds && unitIds.length > 0) {
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
): boolean {
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

  let selectedUnitIds: Types.ObjectId[] | undefined;
  if (apartment.units.length > 0) {
    const requested = input.unitIds ?? (input.unitId ? [input.unitId] : []);
    if (requested.length === 0) throw new AppError(400, "Select a unit for this apartment");
    selectedUnitIds = requested.map((id) => {
      const unit = apartment.units.id(id);
      if (!unit || !unit.isActive) throw new AppError(404, "Apartment unit not found");
      return new Types.ObjectId(id);
    });
  }

  return !(await findConflict(
    apartmentId,
    toUtcDate(input.checkIn),
    toUtcDate(input.checkOut),
    selectedUnitIds,
  ));
}

export async function listApartmentOccupancy(input: {
  checkIn?: string;
  checkOut?: string;
}) {
  const apartments = await Apartment.find({ isActive: true })
    .select("_id slug name subtitle units")
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

    return {
      apartmentId: key,
      slug: apartment.slug,
      name: apartment.name,
      subtitle: apartment.subtitle ?? null,
      available: apartment.units.length > 0
        ? apartment.units.some((unit) => {
            if (!unit.isActive) return false;
            return !conflictsSearch.some(
              (booking) => bookingBlocksUnit(booking, String(unit._id)),
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
          (booking) => bookingBlocksUnit(booking, String(unit._id)),
        );
        const unitCurrent = unitRanges.find(
          (booking) => booking.checkIn <= today && booking.checkOut > today,
        );
        const unitConflicts = unitRanges.some(
          (booking) => booking.checkIn < searchEnd && booking.checkOut > searchStart,
        );
        return {
          id: String(unit._id),
          name: unit.name,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          maxGuests: unit.maxGuests,
          pricePerNight: unit.pricePerNight,
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
    };
  });
}

export async function createBooking(input: CreateBookingInput, userId?: string) {
  const apartmentId = new Types.ObjectId(input.apartmentId);
  const checkIn = toUtcDate(input.checkIn);
  const checkOut = toUtcDate(input.checkOut);
  const nights = calculateNights(checkIn, checkOut);

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

      type SelectedUnit = {
        _id: Types.ObjectId;
        name: string;
        maxGuests: number;
        pricePerNight: number;
        isActive: boolean;
      };
      let selectedUnits: SelectedUnit[] = [];
      if (apartment.units.length > 0) {
        const requestedIds = [...new Set(input.unitIds ?? (input.unitId ? [input.unitId] : []))];
        if (requestedIds.length === 0) {
          throw new AppError(400, "Select at least one unit for this apartment");
        }
        selectedUnits = requestedIds.map((id) => {
          const unit = apartment.units.id(id);
          if (!unit || !unit.isActive) throw new AppError(404, "Apartment unit not found");
          return unit;
        });
        const combinedMaxGuests = selectedUnits.reduce((sum, unit) => sum + unit.maxGuests, 0);
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
      )) {
        throw new AppError(
          409,
          selectedUnits.length === 1
            ? `${selectedUnits[0]!.name} is unavailable for the selected dates`
            : selectedUnits.length > 1
              ? "One or more of the selected units are unavailable for the selected dates"
              : "The apartment is unavailable for the selected dates",
        );
      }

      // Combined nightly rate: sum of all selected unit rates (or apartment rate).
      const nightlyRate = selectedUnits.length > 0
        ? money(selectedUnits.reduce((sum, unit) => sum + unit.pricePerNight, 0))
        : apartment.pricePerNight;
      const staySubtotal = money(nightlyRate * nights);
      const serviceFee = 0;
      const totalAmount = money(staySubtotal + serviceFee + (input.taxi?.fare ?? 0));

      const booking = new Booking({
        ...input,
        userId: userId ? new Types.ObjectId(userId) : undefined,
        apartmentId,
        unitId: selectedUnitIds.length === 1 ? selectedUnitIds[0] : undefined,
        unitIds: selectedUnitIds.length > 0 ? selectedUnitIds : undefined,
        unitName: selectedUnits.length > 0
          ? selectedUnits.map((unit) => unit.name).join(" + ")
          : undefined,
        apartmentName: apartment.subtitle
          ? `${apartment.name} — ${apartment.subtitle}`
          : apartment.name,
        nightlyRate,
        checkIn,
        checkOut,
        nights,
        staySubtotal,
        serviceFee,
        totalAmount,
        bookingReference: generateBookingReference(),
        guestEmail: input.guestEmail.toLowerCase(),
        paymentStatus: input.paymentStatus ?? "unpaid",
        paymentReference: input.paymentReference,
        taxi: input.taxi
          ? {
              ...input.taxi,
              date: toUtcDate(input.taxi.date),
            }
          : undefined,
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

  if (booking.status !== nextStatus) {
    const allowed = STATUS_TRANSITIONS[booking.status] as readonly string[];
    if (!allowed.includes(nextStatus)) {
      throw new AppError(409, `Cannot change booking from ${booking.status} to ${nextStatus}`);
    }
    booking.status = nextStatus;
    await booking.save();
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
