import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { User } from "../modules/users/user.model.js";

const DEFAULT_USER = {
  name: "Demo Guest",
  email: "guest@gmail.com",
  password: "guest@321",
  phone: "+1 246 555 0100",
};

async function main() {
  await mongoose.connect(env.MONGODB_URI);

  const existing = await User.findOne({ email: DEFAULT_USER.email });
  if (existing) {
    console.log(`User already exists: ${DEFAULT_USER.email}`);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_USER.password, 12);
  await User.create({
    name: DEFAULT_USER.name,
    email: DEFAULT_USER.email,
    passwordHash,
    phone: DEFAULT_USER.phone,
  });

  console.log(`Created user: ${DEFAULT_USER.email} / ${DEFAULT_USER.password}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
