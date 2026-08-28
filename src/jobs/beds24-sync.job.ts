import cron from "node-cron";
import { env } from "../config/env.js";
import { syncExpediaBookings } from "../modules/beds24/beds24-sync.service.js";

let running = false;

async function runSync(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await syncExpediaBookings();
    console.log(
      `[beds24-sync] seen=${result.seen} synced=${result.synced} skipped=${result.skipped} errors=${result.errors}`,
    );
  } catch (error) {
    console.error("[beds24-sync] Sync run failed", error);
  } finally {
    running = false;
  }
}

/** Polls Beds24 for Expedia bookings every 15 minutes so the site calendar stays blocked. */
export function startBeds24SyncJob(): void {
  if (!env.BEDS24_REFRESH_TOKEN && !env.BEDS24_ACCESS_TOKEN) {
    console.log("[beds24-sync] Skipped — Beds24 is not configured (no refresh/access token)");
    return;
  }

  void runSync();
  cron.schedule("*/15 * * * *", () => void runSync());
  console.log("[beds24-sync] Scheduled Expedia sync every 15 minutes");
}
