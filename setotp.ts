import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { connectDB } from "./src/config/db";
import { User } from "./src/models/User";
import { hashOtp, otpExpiryDate } from "./src/utils/otp";

async function run() {
  await connectDB();
  const r = await User.updateOne(
    { email: process.argv[2] },
    { $set: { otpHash: await hashOtp("424242"), otpPurpose: (process.argv[3] || "verify-email") as any, otpExpiresAt: otpExpiryDate(), otpAttempts: 0 } }
  );
  console.log("matched:", r.matchedCount);
  await mongoose.connection.close();
}
run();
