import "dotenv/config";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { TaxiSettings } from "../modules/taxi/taxi-settings.model.js";
import { REGULATED_TAXI_FARES } from "../modules/taxi/taxi-settings.service.js";

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const updated = await TaxiSettings.findOneAndUpdate(
    { key: "default" },
    { $set: { key: "default", ...REGULATED_TAXI_FARES } },
    { new: true, upsert: true, runValidators: true },
  );
  console.log("Taxi rates ($/km) set:", {
    "1–4 guests": `$${updated?.fareFor1to4 ?? updated?.fareFor1Guest}/km`,
    "5–7 guests XL": `$${updated?.fareFor5to7 ?? updated?.fareFor3Guests}/km`,
    "8–10 guests": `$${updated?.fareFor8to10 ?? updated?.fareFor4PlusGuests}/km`,
    minimum: `$${updated?.minimumFareUsd}`,
  });
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
