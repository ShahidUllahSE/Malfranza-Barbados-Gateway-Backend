import { Types } from "mongoose";
import { Apartment } from "../apartments/apartment.model.js";
import { Booking } from "../bookings/booking.model.js";
import { createAdminNotification } from "../notifications/admin-notification.service.js";
import { sendAdminOtaChannelBookingEmail } from "../notifications/email.service.js";
import { extractBeds24DataArray, type Beds24ChannelId } from "./beds24-channels.js";
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

type SyncableChannel = Extract<Beds24ChannelId, "expedia" | "booking">;

const CHANNEL_META: Record<
  SyncableChannel,
  {
    guestFallback: string;
    emailPrefix: string;
    refPrefix: string;
    label: string;
    channelHref: string;
  }
> = {
  expedia: {
    guestFallback: "Expedia guest",
    emailPrefix: "expedia",
    refPrefix: "EXP",
    label: "Expedia",
    channelHref: "/admin/channels/expedia",
  },
  booking: {
    guestFallback: "Booking.com guest",
    emailPrefix: "booking",
    refPrefix: "BDC",
    label: "Booking.com",
    channelHref: "/admin/channels/booking",
  },
};

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export type Beds24SyncResult = {
  seen: number;
  synced: number;
  skipped: number;
  errors: number;
  notified: number;
};

export type Beds24AllChannelsSyncResult = {
  expedia: Beds24SyncResult;
  booking: Beds24SyncResult;
};

/**
 * Pulls OTA bookings from Beds24 for one channel and upserts them as local Booking
 * records (source: "beds24") so dashboard, calendar, and availability stay in sync.
 * Only rooms present in BEDS24_ROOM_TO_APARTMENT are synced.
 * New inserts email + notify the admin once (not on later sync updates).
 */
export async function syncBeds24ChannelBookings(
  channel: SyncableChannel,
): Promise<Beds24SyncResult> {
  const meta = CHANNEL_META[channel];
  const raw = await listBeds24Bookings(channel);
  const rows = extractBeds24DataArray(raw) as Beds24Booking[];

  const result: Beds24SyncResult = {
    seen: rows.length,
    synced: 0,
    skipped: 0,
    errors: 0,
    notified: 0,
  };

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
        [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || meta.guestFallback;
      const guestEmail =
        row.email?.trim() || `${meta.emailPrefix}-${row.id}@sync.malfranza.invalid`;
      const guestPhone = row.phone?.trim() || row.mobile?.trim() || "N/A";
      const bookingReference = `${meta.refPrefix}-${row.id}`;
      const externalBookingId = String(row.id);
      const alreadySynced = await Booking.exists({ externalBookingId });

      const updateResult = await Booking.updateOne(
        { externalBookingId },
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
            externalChannel: channel,
          },
          $setOnInsert: {
            bookingReference,
            externalBookingId,
          },
        },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
      result.synced++;

      const isNew =
        !alreadySynced ||
        updateResult.upsertedCount === 1 ||
        Boolean(updateResult.upsertedId);
      const checkOutIso = isoDay(checkOut);
      const todayIso = new Date().toISOString().slice(0, 10);
      const isUpcomingOrActive = checkOutIso >= todayIso;

      if (isNew && status !== "cancelled" && isUpcomingOrActive) {
        let bookingId = updateResult.upsertedId ? String(updateResult.upsertedId) : "";
        if (!bookingId) {
          const saved = await Booking.findOne({ externalBookingId }).select("_id").lean();
          bookingId = saved?._id ? String(saved._id) : externalBookingId;
        }

        await Promise.all([
          sendAdminOtaChannelBookingEmail({
            channel,
            bookingReference,
            guestName,
            guestEmail,
            guestPhone,
            apartmentName: apartment.name,
            checkIn: isoDay(checkIn),
            checkOut: checkOutIso,
            nights,
            guests,
            totalAmount,
            status,
          }).catch((error) => {
            console.error(`[beds24-sync] Failed to email admin for ${channel} booking`, row.id, error);
          }),
          createAdminNotification({
            type: "stay_booking",
            title: `New ${meta.label} booking`,
            body: `${guestName} · ${apartment.name} · ${isoDay(checkIn)} → ${checkOutIso} · ${bookingReference}`,
            href: "/admin",
            entityId: bookingId,
          }).catch((error) => {
            console.error(
              `[beds24-sync] Failed to create admin notification for ${channel} booking`,
              row.id,
              error,
            );
          }),
        ]);

        result.notified++;
      }
    } catch (error) {
      result.errors++;
      console.error(`[beds24-sync] Failed to sync ${channel} booking`, row?.id, error);
    }
  }

  return result;
}

/** @deprecated Prefer syncBeds24ChannelBookings("expedia") — kept for existing callers. */
export async function syncExpediaBookings(): Promise<Beds24SyncResult> {
  return syncBeds24ChannelBookings("expedia");
}

export async function syncBookingComBookings(): Promise<Beds24SyncResult> {
  return syncBeds24ChannelBookings("booking");
}

/** Syncs Expedia + Booking.com into local bookings for dashboard/calendar. */
export async function syncAllBeds24OtaBookings(): Promise<Beds24AllChannelsSyncResult> {
  const [expedia, booking] = await Promise.all([
    syncBeds24ChannelBookings("expedia"),
    syncBeds24ChannelBookings("booking"),
  ]);
  return { expedia, booking };
}
