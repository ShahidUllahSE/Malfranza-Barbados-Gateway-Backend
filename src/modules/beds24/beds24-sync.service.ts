import { Types } from "mongoose";
import { Apartment } from "../apartments/apartment.model.js";
import { Booking } from "../bookings/booking.model.js";
import { extractBeds24DataArray } from "./beds24-channels.js";
import { apartmentIdForBeds24Room } from "./beds24-room-map.js";
import { listBeds24Bookings } from "./beds24.service.js";

type Beds24Booking = {
  id: number;
  roomId?: number;
  status?: string;
  arrival?: string;
  departure?: string;
  numAdult?: number;
  numChild?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  price?: number | string;
};

/** Beds24 booking statuses that free up the dates instead of blocking them. */
const NON_BLOCKING_STATUSES = new Set(["cancelled", "black"]);

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export type Beds24SyncResult = {
  seen: number;
  synced: number;
  skipped: number;
  errors: number;
};

/**
 * Pulls Expedia bookings from Beds24 and upserts them as local Booking records
 * (source: "beds24") so the public availability check blocks those dates.
 * Only rooms present in BEDS24_ROOM_TO_APARTMENT are synced.
 */
export async function syncExpediaBookings(): Promise<Beds24SyncResult> {
  const raw = await listBeds24Bookings("expedia");
  const rows = extractBeds24DataArray(raw) as Beds24Booking[];

  const result: Beds24SyncResult = { seen: rows.length, synced: 0, skipped: 0, errors: 0 };

  for (const row of rows) {
    try {
      if (!row?.id || !row.roomId || !row.arrival || !row.departure) {
        result.skipped++;
        continue;
      }

      const apartmentId = apartmentIdForBeds24Room(row.roomId);
      if (!apartmentId) {
        result.skipped++;
        continue;
      }

      const apartment = await Apartment.findById(apartmentId).select("name").lean();
      if (!apartment) {
        result.skipped++;
        continue;
      }

      const checkIn = toUtcDate(row.arrival);
      const checkOut = toUtcDate(row.departure);
      const nights = Math.max(
        1,
        Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000),
      );
      const totalAmount = money(Number(row.price) || 0);
      const nightlyRate = money(totalAmount / nights);
      const guests = Math.max(1, Number(row.numAdult ?? 1) + Number(row.numChild ?? 0));
      const status = NON_BLOCKING_STATUSES.has(String(row.status ?? "").toLowerCase())
        ? "cancelled"
        : "confirmed";
      const guestName =
        [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "Expedia guest";
      const guestEmail = row.email?.trim() || `expedia-${row.id}@sync.malfranza.invalid`;
      const guestPhone = row.phone?.trim() || row.mobile?.trim() || "N/A";

      await Booking.updateOne(
        { externalBookingId: String(row.id) },
        {
          $set: {
            apartmentId: new Types.ObjectId(apartmentId),
            apartmentName: apartment.name,
            checkIn,
            checkOut,
            nights,
            guests,
            guestName,
            guestEmail,
            guestPhone,
            nightlyRate,
            staySubtotal: totalAmount,
            serviceFee: 0,
            totalAmount,
            status,
            source: "beds24",
            externalChannel: "expedia",
          },
          $setOnInsert: {
            bookingReference: `EXP-${row.id}`,
            externalBookingId: String(row.id),
          },
        },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
      result.synced++;
    } catch (error) {
      result.errors++;
      console.error("[beds24-sync] Failed to sync booking", row?.id, error);
    }
  }

  return result;
}
