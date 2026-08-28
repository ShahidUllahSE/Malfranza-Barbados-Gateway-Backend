import { createAdminNotification } from "../notifications/admin-notification.service.js";
import { Booking } from "../bookings/booking.model.js";
import { beds24RoomIdForApartment } from "./beds24-room-map.js";
import { upsertBeds24Bookings } from "./beds24.service.js";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function splitGuestName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) };
}

async function alertAdmin(title: string, body: string, bookingId: string): Promise<void> {
  await createAdminNotification({
    type: "stay_booking",
    title,
    body,
    href: "/admin/bookings",
    entityId: bookingId,
  }).catch((err) => console.error("[beds24-push] Failed to create admin alert", err));
}

/**
 * Pushes a newly-created direct/website booking out to Beds24 so it blocks the
 * dates on Expedia and every other connected OTA. Only apartments currently
 * linked to a Beds24 room (see beds24-room-map.ts) are pushed — others are
 * silently skipped. Best-effort: failures raise an admin notification instead
 * of failing the website booking itself.
 */
export async function pushDirectBookingToBeds24(bookingId: string): Promise<void> {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.source !== "direct") return;

  const roomId = beds24RoomIdForApartment(String(booking.apartmentId));
  if (!roomId) return;

  const { firstName, lastName } = splitGuestName(booking.guestName);

  try {
    const [result] = await upsertBeds24Bookings([
      {
        roomId,
        status: booking.status === "pending" ? "request" : "confirmed",
        arrival: isoDate(booking.checkIn),
        departure: isoDate(booking.checkOut),
        numAdult: booking.guests,
        firstName,
        lastName,
        email: booking.guestEmail,
        phone: booking.guestPhone,
        price: booking.totalAmount,
        comment: `Malfranza website booking ${booking.bookingReference}`,
      },
    ]);

    const newId = result?.new?.id;
    if (!result?.success || !newId) {
      throw new Error(`Beds24 did not confirm creation: ${JSON.stringify(result)}`);
    }

    await Booking.updateOne({ _id: booking._id }, { $set: { beds24BookingId: String(newId) } });
  } catch (error) {
    console.error(`[beds24-push] Failed to push booking ${booking.bookingReference} to Beds24`, error);
    await alertAdmin(
      "Expedia sync failed for a new booking",
      `${booking.apartmentName} · ${booking.bookingReference} · ${isoDate(booking.checkIn)} -> ${isoDate(booking.checkOut)} could not be pushed to Beds24/Expedia. Block these dates there manually until this is resolved.`,
      String(booking._id),
    );
  }
}

/**
 * Releases a cancelled direct/website booking's dates on Beds24/Expedia.
 * No-op if the booking was never pushed out (not linked, or the push itself
 * failed and there's no beds24BookingId to cancel).
 */
export async function cancelDirectBookingInBeds24(bookingId: string): Promise<void> {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.source !== "direct" || !booking.beds24BookingId) return;

  try {
    const [result] = await upsertBeds24Bookings([
      { id: Number(booking.beds24BookingId), status: "cancelled" },
    ]);
    if (!result?.success) {
      throw new Error(`Beds24 did not confirm cancellation: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    console.error(`[beds24-push] Failed to cancel booking ${booking.bookingReference} on Beds24`, error);
    await alertAdmin(
      "Expedia sync failed for a cancellation",
      `${booking.apartmentName} · ${booking.bookingReference} was cancelled on the website but could not be released on Beds24/Expedia. Cancel it there manually so the dates reopen.`,
      String(booking._id),
    );
  }
}
