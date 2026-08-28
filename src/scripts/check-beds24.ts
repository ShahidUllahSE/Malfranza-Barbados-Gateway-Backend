import "dotenv/config";
import { probeBeds24Health } from "../modules/beds24/beds24.service.js";

async function main() {
  const health = await probeBeds24Health();

  console.log("Beds24 connection check");
  console.log("-----------------------");
  console.log(`Configured:     ${health.configured ? "yes" : "no"}`);
  console.log(`Refresh token:  ${health.hasRefreshToken ? "yes" : "no"}`);
  console.log(`API base:       ${health.apiBase}`);
  console.log(`API reachable:  ${health.apiOk ? "yes" : "no"}`);

  if (health.apiOk) {
    console.log(`Properties:     ${health.propertyCount ?? 0}`);
    console.log(`Bookings:       ${health.bookingCount ?? 0}`);
  }

  if (health.message) {
    console.log(`Note:           ${health.message}`);
  }

  if ("error" in health && health.error) {
    console.error(`Error:          ${health.error}`);
    process.exitCode = 1;
  } else if (!health.configured) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
