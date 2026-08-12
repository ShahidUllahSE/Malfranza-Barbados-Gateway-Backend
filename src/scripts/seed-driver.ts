import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Driver } from "../modules/drivers/driver.model.js";

const FLEET = [
  {
    name: "Malfranza Van 7",
    email: "driver@gmail.com",
    password: "driver@321",
    phone: "+1 246 555 0200",
    vehicleLabel: "7-seater van",
    passengerCapacity: 7,
  },
  {
    name: "Malfranza Van 10",
    email: "driver10@malfranza.com",
    password: "driver@321",
    phone: "+1 246 555 0210",
    vehicleLabel: "10-seater van",
    passengerCapacity: 10,
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
