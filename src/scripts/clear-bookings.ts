/**
 * Delete all stay bookings, booking locks, and taxi bookings.
 * Does NOT delete apartments, users, agencies, drivers, or settings.
 *
 * Usage: npx tsx src/scripts/clear-bookings.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Booking, BookingLock } from "../modules/bookings/booking.model.js";
import { TaxiBooking } from "../modules/taxi/taxi.model.js";

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const [stays, locks, taxi] = await Promise.all([
    Booking.deleteMany({}),
    BookingLock.deleteMany({}),
    TaxiBooking.deleteMany({}),
  ]);

  console.log(`Deleted stay bookings: ${stays.deletedCount}`);
  console.log(`Deleted booking locks: ${locks.deletedCount}`);
  console.log(`Deleted taxi bookings: ${taxi.deletedCount}`);
  console.log("Done — apartments, users, agencies, and drivers kept.");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
