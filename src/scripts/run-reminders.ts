/**
 * Send scheduled guest / driver reminder emails.
 *
 * Run daily via cron, e.g.:
 *   0 12 * * * cd /path/to/backend && npm run reminders:run
 *
 * Window logic (UTC calendar days):
 * - Stay reminder: check-in in 2 days
 * - Check-in instructions: check-in tomorrow
 * - Ride reminder (guest + driver): pickup tomorrow
 */
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Booking } from "../modules/bookings/booking.model.js";
import {
  sendCheckInInstructionsEmail,
  sendDriverTripReminderEmail,
  sendRideReminderEmail,
  sendStayReminderEmail,
} from "../modules/notifications/email.service.js";
import { TaxiBooking } from "../modules/taxi/taxi.model.js";

function utcDayOffset(days: number): { start: Date; end: Date } {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  const start = new Date(base);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

async function runReminders() {
  await connectDatabase();

  const in2Days = utcDayOffset(2);
  const tomorrow = utcDayOffset(1);

  const staysIn2Days = await Booking.find({
    status: { $in: ["pending", "confirmed"] },
    paymentStatus: { $ne: "refunded" },
    checkIn: { $gte: in2Days.start, $lte: in2Days.end },
  }).lean();

  let stayReminders = 0;
  for (const b of staysIn2Days) {
    await sendStayReminderEmail({
      to: b.guestEmail,
      name: b.guestName,
      apartmentName: b.apartmentName,
      checkIn: String(b.checkIn).slice(0, 10),
      checkOut: String(b.checkOut).slice(0, 10),
      bookingReference: b.bookingReference,
      hasTaxi: Boolean(b.taxi),
    }).catch((error) => console.error("[reminders] stay", b.bookingReference, error));
    stayReminders += 1;
  }

  const staysTomorrow = await Booking.find({
    status: { $in: ["pending", "confirmed"] },
    paymentStatus: { $ne: "refunded" },
    checkIn: { $gte: tomorrow.start, $lte: tomorrow.end },
  }).lean();

  let checkInInstructions = 0;
  for (const b of staysTomorrow) {
    await sendCheckInInstructionsEmail({
      to: b.guestEmail,
      name: b.guestName,
      apartmentName: b.apartmentName,
      checkIn: String(b.checkIn).slice(0, 10),
      bookingReference: b.bookingReference,
    }).catch((error) => console.error("[reminders] check-in", b.bookingReference, error));
    checkInInstructions += 1;
  }

  const ridesTomorrow = await TaxiBooking.find({
    status: { $in: ["pending", "confirmed", "assigned"] },
    pickupDate: { $gte: tomorrow.start, $lte: tomorrow.end },
  })
    .populate("driverId", "name email phone")
    .lean();

  let rideReminders = 0;
  let driverReminders = 0;
  for (const t of ridesTomorrow) {
    const driver =
      t.driverId && typeof t.driverId === "object"
        ? (t.driverId as { name?: string; email?: string; phone?: string })
        : null;

    await sendRideReminderEmail({
      to: t.customerEmail,
      name: t.customerName,
      pickupDate: String(t.pickupDate).slice(0, 10),
      pickupTime: t.pickupTime,
      pickupLocation: t.pickupLocation,
      dropoffLocation: t.dropoffLocation,
      passengers: Number(t.passengers),
      driverName: driver?.name ?? null,
      driverPhone: driver?.phone ?? null,
      bookingReference: t.bookingReference,
    }).catch((error) => console.error("[reminders] ride", t.bookingReference, error));
    rideReminders += 1;

    if (driver?.email && driver.name) {
      await sendDriverTripReminderEmail({
        to: driver.email,
        driverName: driver.name,
        pickupDate: String(t.pickupDate).slice(0, 10),
        pickupTime: t.pickupTime,
        pickupLocation: t.pickupLocation,
        dropoffLocation: t.dropoffLocation,
        customerName: t.customerName,
        customerPhone: t.customerPhone,
      }).catch((error) => console.error("[reminders] driver", t.bookingReference, error));
      driverReminders += 1;
    }
  }

  console.log(
    JSON.stringify({
      stayReminders,
      checkInInstructions,
      rideReminders,
      driverReminders,
    }),
  );
}

runReminders()
  .catch((error: unknown) => {
    console.error("Reminder job failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
