import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { User } from "./models/User";

// ---------------------------------------------------------------------------
// Promotes an existing account to admin, so it can open /dashboard.
//
// Run it with the email of the account you want to promote:
//
//   npm run make-admin -- you@example.com
//
// With no email, it just lists the accounts that exist so you can pick one.
// ---------------------------------------------------------------------------
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

  // isVerified too: an unverified account can't log in, so promoting it
  // without that would leave you locked out of the dashboard anyway.
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
