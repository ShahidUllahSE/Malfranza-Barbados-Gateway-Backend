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
  session?: ClientSession,
): Promise<boolean> {
  const filter: QueryFilter<BookingRecord> = {
    apartmentId,
    status: { $in: BLOCKING_STATUSES },
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
  };
  const query = Booking.exists(filter);

  if (session) query.session(session);
  return (await query) !== null;
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
  const apartmentExists = await Apartment.exists({ _id: apartmentId, isActive: true });
  if (!apartmentExists) throw new AppError(404, "Apartment not found");
  return !(await findConflict(apartmentId, toUtcDate(input.checkIn), toUtcDate(input.checkOut)));
}

export async function listApartmentOccupancy(input: {
  checkIn?: string;
  checkOut?: string;
}) {
  const apartments = await Apartment.find({ isActive: true })
    .select("_id slug name subtitle")
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
    .select("apartmentId checkIn checkOut status")
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
      available: availableForRequest,
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
      })),
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

      if (await findConflict(apartmentId, checkIn, checkOut, session)) {
        throw new AppError(409, "The apartment is unavailable for the selected dates");
      }

      const staySubtotal = money(apartment.pricePerNight * nights);
      const serviceFee = 0;
      const totalAmount = money(staySubtotal + serviceFee + (input.taxi?.fare ?? 0));

      const booking = new Booking({
        ...input,
        userId: userId ? new Types.ObjectId(userId) : undefined,
        apartmentId,
        apartmentName: apartment.subtitle
          ? `${apartment.name} — ${apartment.subtitle}`
          : apartment.name,
        nightlyRate: apartment.pricePerNight,
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
