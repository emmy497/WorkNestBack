import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { Company } from "./models/Company";

// ---------------------------------------------------------------------------
// industry/location/about were added to the Company model after the original
// seed ran, so companies already in the database have none of them — that's
// why the Clients page cards were missing a location. Re-seeding would fix
// it, but it wipes Job/Company entirely, orphaning any Application/SavedJob
// that points at the current job ids.
//
// This script does the narrow thing instead: fill in those three fields,
// by name, only where they're still missing — every job/application/id
// stays untouched.
//
// Run with:  npm run backfill-company-details
// ---------------------------------------------------------------------------
const DETAILS: Record<string, { industry: string; location: string; about: string }> = {
  Paystack: {
    industry: "Payments",
    location: "Lagos, Nigeria",
    about: "Modern online and offline payments for Africa.",
  },
  PiggyVest: {
    industry: "Savings",
    location: "Lagos, Nigeria",
    about: "Savings and investing for everyday people.",
  },
  Moniepoint: {
    industry: "Fintech",
    location: "Lagos, Nigeria",
    about: "Banking and payments for millions of Nigerian businesses.",
  },
  Bumpa: {
    industry: "Commerce tools",
    location: "Lagos, Nigeria",
    about: "Tools that help small businesses sell online.",
  },
  Kuda: {
    industry: "Digital banking",
    location: "Lagos, Nigeria",
    about: "The bank of the free — mobile-first banking.",
  },
  Cowrywise: {
    industry: "Wealth & investing",
    location: "Lagos, Nigeria",
    about: "Helping people save and invest with confidence.",
  },
  Flutterwave: {
    industry: "Payments infrastructure",
    location: "Lagos, Nigeria",
    about: "Payment infrastructure moving money across Africa.",
  },
};

async function run() {
  await connectDB();

  const companies = await Company.find({});
  let updated = 0;

  for (const company of companies) {
    const details = DETAILS[company.name];
    if (!details) continue;
    if (company.industry && company.location && company.about) continue;

    company.industry ||= details.industry;
    company.location ||= details.location;
    company.about ||= details.about;
    await company.save();
    updated += 1;
  }

  console.log(`Backfilled details for ${updated} of ${companies.length} compan(y/ies).`);

  await mongoose.disconnect();
}

run();
