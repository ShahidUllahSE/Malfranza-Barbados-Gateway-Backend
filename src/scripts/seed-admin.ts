import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Admin } from "../modules/auth/admin.model.js";

const DEFAULT_ADMIN = {
  email: "admin1@gmail.com",
  password: "admin123",
  role: "admin" as const,
};

async function main() {
  await mongoose.connect(env.MONGODB_URI);

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, 12);
  const existing = await Admin.findOne({ email: DEFAULT_ADMIN.email }).select("+passwordHash");

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = DEFAULT_ADMIN.role;
    existing.isActive = true;
    await existing.save();
    console.log(`Updated admin: ${DEFAULT_ADMIN.email} / ${DEFAULT_ADMIN.password}`);
  } else {
    await Admin.create({
      email: DEFAULT_ADMIN.email,
      passwordHash,
      role: DEFAULT_ADMIN.role,
      isActive: true,
    });
    console.log(`Created admin: ${DEFAULT_ADMIN.email} / ${DEFAULT_ADMIN.password}`);
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
