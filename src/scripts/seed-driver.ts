import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Driver } from "../modules/drivers/driver.model.js";

const FLEET = [
  {
    name: "Malfranza XL",
    email: "driver10@malfranza.com",
    password: "driver@321",
    phone: "+1 246 555 0210",
    vehicleLabel: "XL — 7 seats",
    passengerCapacity: 7,
    pricePerKmUsd: 2.4,
  },
  {
    name: "Malfranza Coach",
    email: "driver@gmail.com",
    password: "driver@321",
    phone: "+1 246 555 0200",
    vehicleLabel: "12-seater",
    passengerCapacity: 12,
    pricePerKmUsd: 4,
  },
] as const;

async function upsertDriver(entry: (typeof FLEET)[number]) {
  const passwordHash = await bcrypt.hash(entry.password, 12);
  const existing = await Driver.findOne({ email: entry.email });
  if (existing) {
    existing.name = entry.name;
    existing.phone = entry.phone;
    existing.vehicleLabel = entry.vehicleLabel;
    existing.passengerCapacity = entry.passengerCapacity;
    existing.pricePerKmUsd = entry.pricePerKmUsd;
    existing.isActive = true;
    existing.isAvailable = true;
    existing.passwordHash = passwordHash;
    await existing.save();
    console.log(`Updated ${entry.vehicleLabel}: ${entry.email} / ${entry.password}`);
    return;
  }

  await Driver.create({
    name: entry.name,
    email: entry.email,
    phone: entry.phone,
    vehicleLabel: entry.vehicleLabel,
    passengerCapacity: entry.passengerCapacity,
    pricePerKmUsd: entry.pricePerKmUsd,
    passwordHash,
    isActive: true,
    isAvailable: true,
  });
  console.log(`Created ${entry.vehicleLabel}: ${entry.email} / ${entry.password}`);
}

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  for (const vehicle of FLEET) {
    await upsertDriver(vehicle);
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
