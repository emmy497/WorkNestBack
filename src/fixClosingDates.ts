import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { Job } from "./models/Job";

// ---------------------------------------------------------------------------
// seed.ts sets each job's closesAt relative to WHEN THE SEED RAN, not on a
// rolling window — so every deadline eventually goes stale, and jobController
// now (correctly) excludes any job whose closesAt has passed. Re-seeding
// would fix the dates, but it wipes Job/Company entirely, orphaning any
// Application/SavedJob that points at the current job ids.
//
// This script does the narrow thing instead: push every OPEN job's closesAt
// forward by just enough that the most overdue one lands a week from now,
// keeping every job's id (and relative "closes soonest" ordering) untouched.
//
// Run with:  npm run fix-closing-dates
// ---------------------------------------------------------------------------
async function run() {
  await connectDB();

  const jobs = await Job.find({ status: "open" });

  if (jobs.length === 0) {
    console.log("No open jobs found — nothing to fix.");
    await mongoose.disconnect();
    return;
  }

  const now = Date.now();
  const mostOverdueMs = Math.max(...jobs.map((job) => now - job.closesAt.getTime()));

  // Only bother shifting if something has actually gone stale.
  if (mostOverdueMs <= 0) {
    console.log("Every open job already closes in the future — nothing to fix.");
    await mongoose.disconnect();
    return;
  }

  const shiftMs = mostOverdueMs + 7 * 24 * 60 * 60 * 1000; // land the worst one ~7 days out

  for (const job of jobs) {
    job.closesAt = new Date(job.closesAt.getTime() + shiftMs);
    await job.save();
  }

  console.log(
    `Shifted closesAt forward by ${(shiftMs / (24 * 60 * 60 * 1000)).toFixed(1)} days for ${jobs.length} job(s).`
  );

  await mongoose.disconnect();
}

run();
