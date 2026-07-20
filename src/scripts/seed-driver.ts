import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Driver } from "../modules/drivers/driver.model.js";

const DEFAULT_DRIVER = {
  name: "Demo Driver",
  email: "driver@gmail.com",
  password: "driver@321",
  phone: "+1 246 555 0200",
  vehicleLabel: "White van · B 2468",
};

async function main() {
  await mongoose.connect(env.MONGODB_URI);

  const existing = await Driver.findOne({ email: DEFAULT_DRIVER.email });
  if (existing) {
    existing.name = DEFAULT_DRIVER.name;
    existing.phone = DEFAULT_DRIVER.phone;
    existing.vehicleLabel = DEFAULT_DRIVER.vehicleLabel;
    existing.isActive = true;
    existing.isAvailable = true;
    existing.passwordHash = await bcrypt.hash(DEFAULT_DRIVER.password, 12);
    await existing.save();
    console.log(`Updated driver: ${DEFAULT_DRIVER.email} / ${DEFAULT_DRIVER.password}`);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_DRIVER.password, 12);
  await Driver.create({
    name: DEFAULT_DRIVER.name,
    email: DEFAULT_DRIVER.email,
    phone: DEFAULT_DRIVER.phone,
    vehicleLabel: DEFAULT_DRIVER.vehicleLabel,
    passwordHash,
    isActive: true,
    isAvailable: true,
  });

  console.log(`Created driver: ${DEFAULT_DRIVER.email} / ${DEFAULT_DRIVER.password}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
