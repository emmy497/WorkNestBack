import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { User } from "./models/User";

async function run() {
  await connectDB();

  const email = process.argv[2];

  if (!email) {
    const users = await User.find()
      .select("name email role isVerified")
      .sort({ createdAt: -1 })
      .lean();

    console.log("\nAccounts in the database:\n");
    users.forEach((user) => {
      const verified = user.isVerified ? "verified" : "NOT verified";
      console.log(`  ${user.email}  —  ${user.role}, ${verified}`);
    });
    console.log("\nRe-run with an email to make that account an admin:");
    console.log("  npm run make-admin -- you@example.com\n");

    await mongoose.connection.close();
    return;
  }

  const result = await User.updateOne(
    { email },
    { $set: { role: "admin", isVerified: true } }
  );

  if (result.matchedCount === 0) {
    console.log(`No account found for ${email}`);
  } else {
    console.log(`${email} is now an admin and can open /dashboard`);
  }

  await mongoose.connection.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
