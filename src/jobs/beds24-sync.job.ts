import cron from "node-cron";
import { env } from "../config/env.js";
import { syncAllBeds24OtaBookings } from "../modules/beds24/beds24-sync.service.js";

let running = false;

function formatResult(label: string, result: { seen: number; synced: number; skipped: number; errors: number; notified?: number }) {
  return `${label} seen=${result.seen} synced=${result.synced} skipped=${result.skipped} errors=${result.errors} notified=${result.notified ?? 0}`;
}

async function runSync(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await syncAllBeds24OtaBookings();
    console.log(
      `[beds24-sync] ${formatResult("expedia", result.expedia)} | ${formatResult("booking", result.booking)}`,
    );
  } catch (error) {
    console.error("[beds24-sync] Sync run failed", error);
  } finally {
    running = false;
  }
}

/** Polls Beds24 for Expedia + Booking.com bookings every 15 minutes. */
export function startBeds24SyncJob(): void {
  if (!env.BEDS24_REFRESH_TOKEN && !env.BEDS24_ACCESS_TOKEN) {
    console.log("[beds24-sync] Skipped — Beds24 is not configured (no refresh/access token)");
    return;
  }

  void runSync();
  cron.schedule("*/15 * * * *", () => void runSync());
  console.log("[beds24-sync] Scheduled Expedia + Booking.com sync every 15 minutes");
}
