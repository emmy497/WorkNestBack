import dotenv from "dotenv";
import crypto from "crypto";
import mongoose from "mongoose";

import { connectDB } from "./config/db";
import { User } from "./models/User";
import { Job } from "./models/Job";
import { Application, ApplicationStatus } from "./models/Application";

dotenv.config();


const DEMO_DOMAIN = "@demo.worknest";

interface DemoCandidate {
  name: string;
  headline: string;
  location: string;
  yearsOfExperience: string;
  skills: string[];
  availability: string;
  openToWork?: boolean;
  appliesTo?: string;
  hired?: boolean;
}

const CANDIDATES: DemoCandidate[] = [
  { name: "Amara Okafor", headline: "Senior Product Designer", location: "Lagos, Nigeria", yearsOfExperience: "5-10 years", skills: ["Figma", "Design systems", "Research", "Prototyping"], availability: "1 month notice", appliesTo: "Product Designer", hired: true },
  { name: "Emeka Obi", headline: "Product Designer", location: "Remote", yearsOfExperience: "5-10 years", skills: ["Figma", "Prototyping", "Interaction"], availability: "2 weeks notice", appliesTo: "Product Designer" },
  { name: "Adaeze Nwankwo", headline: "Senior Product Designer", location: "Lagos, Nigeria", yearsOfExperience: "5-10 years", skills: ["Figma", "Design systems", "Mentoring"], availability: "1 month notice", appliesTo: "Product Designer" },
  { name: "Zainab Yusuf", headline: "Product Designer", location: "Remote", yearsOfExperience: "3-5 years", skills: ["Figma", "UX", "Portfolio"], availability: "Immediately", appliesTo: "Product Designer" },
  { name: "Chidi Nwosu", headline: "Product Designer", location: "Lagos, Nigeria", yearsOfExperience: "3-5 years", skills: ["Figma", "Research"], availability: "2 weeks notice", appliesTo: "Junior UX Researcher" },
  { name: "Ngozi Eze", headline: "Product Designer", location: "Remote", yearsOfExperience: "3-5 years", skills: ["Figma", "UI"], availability: "Immediately", appliesTo: "Product Designer" },
  { name: "Tolu Ajayi", headline: "UI Designer", location: "Lagos, Nigeria", yearsOfExperience: "1-3 years", skills: ["Figma", "UI"], availability: "Immediately", appliesTo: "Junior UX Researcher" },
  { name: "Daniel Balogun", headline: "Designer", location: "Remote", yearsOfExperience: "1-3 years", skills: ["Figma"], availability: "Open to discuss", appliesTo: "Junior UX Researcher" },
  { name: "Funke Adeyinka", headline: "UX/UI Designer", location: "Lagos, Nigeria", yearsOfExperience: "3-5 years", skills: ["Figma"], availability: "2 weeks notice", appliesTo: "Product Designer" },
  { name: "Ibrahim Kalu", headline: "Frontend Engineer", location: "Remote", yearsOfExperience: "3-5 years", skills: ["React", "TypeScript", "Testing"], availability: "1 month notice", appliesTo: "Frontend Engineer" },
  { name: "Oyinkan Bello", headline: "Senior Frontend Engineer", location: "Lagos, Nigeria", yearsOfExperience: "5-10 years", skills: ["React", "Performance", "Accessibility"], availability: "Open to discuss", openToWork: false, appliesTo: "Frontend Engineer" },
  { name: "Kelechi Umeh", headline: "Frontend Engineer", location: "Remote", yearsOfExperience: "1-3 years", skills: ["React", "JavaScript"], availability: "Immediately", appliesTo: "Software Engineer" },
  { name: "Bola Martins", headline: "Product Manager", location: "Lagos, Nigeria", yearsOfExperience: "5-10 years", skills: ["Product", "Roadmapping", "Analytics"], availability: "1 month notice" },
  { name: "Sade Coker", headline: "Data Analyst", location: "Remote", yearsOfExperience: "0-1 years", skills: ["SQL", "Python", "Dashboards"], availability: "Immediately" },
];

function demoEmail(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, ".") + DEMO_DOMAIN;
}

async function removeDemoData() {
  const existing = await User.find({ email: { $regex: `${DEMO_DOMAIN.replace(".", "\\.")}$` } }).select("_id");
  const ids = existing.map((u) => u._id);
  const apps = await Application.deleteMany({ applicant: { $in: ids } });
  const users = await User.deleteMany({ _id: { $in: ids } });
  console.log(`Removed ${users.deletedCount} demo candidates and ${apps.deletedCount} applications`);
}

async function seedCandidates() {
  await removeDemoData();

  const jobs = await Job.find({ status: "open" }).select("title");
  const jobByTitle = new Map(jobs.map((job) => [job.title, job._id]));

  let applications = 0;

  for (const candidate of CANDIDATES) {
    const email = demoEmail(candidate.name);

    const user = await User.create({
      name: candidate.name,
      email,
      password: crypto.randomBytes(24).toString("hex"),
      role: "candidate",
      isVerified: true,
      headline: candidate.headline,
      location: candidate.location,
      yearsOfExperience: candidate.yearsOfExperience,
      skills: candidate.skills,
      availability: candidate.availability,
      openToWork: candidate.openToWork ?? true,
      preferredWorkArrangements: [candidate.location === "Remote" ? "Remote" : "Hybrid"],
      preferredJobTypes: ["Full-time"],
    });

    const jobId = candidate.appliesTo ? jobByTitle.get(candidate.appliesTo) : undefined;
    if (!jobId) continue;

    const status: ApplicationStatus = candidate.hired ? "hired" : "submitted";
    const statusHistory: { status: ApplicationStatus }[] = candidate.hired
      ? [{ status: "submitted" }, { status: "hired" }]
      : [{ status: "submitted" }];
    await Application.create({
      job: jobId,
      applicant: user._id,
      fullName: candidate.name,
      email,
      location: candidate.location,
      yearsOfExperience: candidate.yearsOfExperience,
      availability: candidate.availability,
      whyThisRole: `I'd love to bring my ${candidate.skills[0]} experience to this team.`,
      status,
      statusHistory,
    });
    applications++;
  }

  console.log(`Added ${CANDIDATES.length} demo candidates and ${applications} applications`);
}

async function run() {
  await connectDB();

  if (process.argv.includes("--remove")) {
    await removeDemoData();
  } else {
    await seedCandidates();
  }

  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error("seed-candidates failed:", error);
  await mongoose.connection.close();
  process.exit(1);
});
