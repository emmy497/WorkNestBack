import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { Job } from "./models/Job";

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

  if (mostOverdueMs <= 0) {
    console.log("Every open job already closes in the future — nothing to fix.");
    await mongoose.disconnect();
    return;
  }

  const shiftMs = mostOverdueMs + 7 * 24 * 60 * 60 * 1000;

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
