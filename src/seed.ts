import dotenv from "dotenv";
import mongoose from "mongoose";

import { connectDB } from "./config/db";
import { Company } from "./models/Company";
import { Job } from "./models/Job";
import { WorkArrangement, JobType, ExperienceLevel, CareerPath } from "./types/enums";

dotenv.config();

// ---------------------------------------------------------------------------
// A seed script fills an empty database with starting data.
// Run it with:  npm run seed
//
// It is SAFE to run more than once — it wipes the jobs and companies
// collections first, so you never end up with duplicates.
// ---------------------------------------------------------------------------

// Turns "Frontend Engineer" into "frontend-engineer"
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // remove punctuation
    .replace(/\s+/g, "-") // spaces become hyphens
    .replace(/-+/g, "-"); // collapse repeated hyphens
}

// Takes a number of days and returns a Date that many days in the future
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

const companies = [
  {
    name: "Paystack",
    website: "https://paystack.com",
    industry: "Payments",
    location: "Lagos, Nigeria",
    about: "Modern online and offline payments for Africa.",
  },
  {
    name: "PiggyVest",
    website: "https://piggyvest.com",
    industry: "Savings",
    location: "Lagos, Nigeria",
    about: "Savings and investing for everyday people.",
  },
  {
    name: "Moniepoint",
    website: "https://moniepoint.com",
    industry: "Fintech",
    location: "Lagos, Nigeria",
    about: "Banking and payments for millions of Nigerian businesses.",
  },
  {
    name: "Bumpa",
    website: "https://getbumpa.com",
    industry: "Commerce tools",
    location: "Lagos, Nigeria",
    about: "Tools that help small businesses sell online.",
  },
  {
    name: "Kuda",
    website: "https://kuda.com",
    industry: "Digital banking",
    location: "Lagos, Nigeria",
    about: "The bank of the free — mobile-first banking.",
  },
  {
    name: "Cowrywise",
    website: "https://cowrywise.com",
    industry: "Wealth & investing",
    location: "Lagos, Nigeria",
    about: "Helping people save and invest with confidence.",
  },
  {
    name: "Flutterwave",
    website: "https://flutterwave.com",
    industry: "Payments infrastructure",
    location: "Lagos, Nigeria",
    about: "Payment infrastructure moving money across Africa.",
  },
];

// The same 8 jobs from your mock data. `companyName` is a temporary field —
// we use it to look up the real company id below, then drop it.
type SeedJob = {
  companyName: string;
  title: string;
  description: string;
  location: string;
  workArrangement: WorkArrangement;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  careerPath: CareerPath;
  salaryMin: number;
  salaryMax: number;
  closesInDays: number;
  featured?: boolean;
  whyThisCouldFit: string;
  responsibilities: string[];
  requirements: string[];
  skills: string[];
};

const jobs: SeedJob[] = [
  {
    companyName: "Paystack",
    title: "Frontend Engineer",
    description:
      "Build the interfaces businesses across Africa use to accept payments. You'll work on performance-critical dashboards where reliability and polish both matter.",
    location: "Remote",
    workArrangement: "Remote",
    jobType: "Full-time",
    experienceLevel: "Senior",
    careerPath: "Engineering",
    salaryMin: 900000,
    salaryMax: 1400000,
    closesInDays: 11,
    whyThisCouldFit: "Fully remote — work from anywhere in Nigeria",
    responsibilities: [
      "Build and maintain complex React interfaces",
      "Own frontend performance and accessibility",
      "Collaborate with design on a shared component library",
      "Mentor engineers earlier in their careers",
    ],
    requirements: [
      "5+ years building production frontends",
      "Deep React and TypeScript experience",
      "Strong sense for UI detail and performance",
      "Experience in a fast-shipping product team",
    ],
    skills: ["React", "TypeScript", "Accessibility", "Testing", "Performance"],
  },
  {
    companyName: "PiggyVest",
    title: "Product Marketing Intern",
    description:
      "A hands-on internship for someone who loves how products get talked about. You'll learn by shipping real campaigns alongside the marketing team.",
    location: "Lagos",
    workArrangement: "Onsite",
    jobType: "Internship",
    experienceLevel: "Junior",
    careerPath: "Marketing",
    salaryMin: 150000,
    salaryMax: 250000,
    closesInDays: 9,
    whyThisCouldFit: "No prior experience required — training provided",
    responsibilities: [
      "Draft copy for product launches and social posts",
      "Help run campaigns from brief to publish",
      "Track how campaigns perform and report back",
      "Sit in on user interviews and research sessions",
    ],
    requirements: [
      "Strong written communication",
      "Genuine curiosity about how products get adopted",
      "Comfortable working onsite in Lagos",
      "Available for a six-month placement",
    ],
    skills: ["Copywriting", "Social Media", "Analytics", "Research"],
  },
  {
    companyName: "Moniepoint",
    title: "Product Designer",
    description:
      "We're looking for a product designer to shape the everyday banking experience used by millions of Nigerians, from first sign-up to daily transfers.",
    location: "Lagos",
    workArrangement: "Hybrid",
    jobType: "Full-time",
    experienceLevel: "Mid-level",
    careerPath: "Design",
    salaryMin: 650000,
    salaryMax: 900000,
    closesInDays: 6,
    featured: true,
    whyThisCouldFit: "Hybrid — two days a week in the Lagos office",
    responsibilities: [
      "Design end-to-end flows for core banking features",
      "Run usability sessions with real merchants",
      "Contribute to and extend the design system",
      "Partner closely with engineering through delivery",
    ],
    requirements: [
      "3+ years designing consumer or fintech products",
      "A portfolio showing shipped work, not just concepts",
      "Comfortable with research and interaction design",
      "Fluent in Figma and design systems thinking",
    ],
    skills: ["Figma", "Design Systems", "User Research", "Prototyping"],
  },
  {
    companyName: "Bumpa",
    title: "Brand Designer",
    description:
      "Own the visual voice of a brand helping small businesses sell online. From social to product marketing, you'll make the work people actually remember.",
    location: "Lagos",
    workArrangement: "Hybrid",
    jobType: "Full-time",
    experienceLevel: "Mid-level",
    careerPath: "Design",
    salaryMin: 550000,
    salaryMax: 600000,
    closesInDays: 5,
    whyThisCouldFit: "Full creative ownership of the brand",
    responsibilities: [
      "Define and maintain the visual brand language",
      "Design campaign assets across social and web",
      "Work with marketing on launches end to end",
      "Keep brand consistency across every surface",
    ],
    requirements: [
      "3+ years in brand or marketing design",
      "A portfolio with strong visual range",
      "Comfortable moving fast on campaign work",
      "Motion or illustration skills are a plus",
    ],
    skills: ["Brand Identity", "Figma", "Illustration", "Motion"],
  },
  {
    companyName: "Kuda",
    title: "Customer Success Lead",
    description:
      "Lead a team keeping Kuda's customers happy, heard, and supported. You'll turn support conversations into product insight the whole company uses.",
    location: "Lagos",
    workArrangement: "Onsite",
    jobType: "Full-time",
    experienceLevel: "Mid-level",
    careerPath: "Customer",
    salaryMin: 450000,
    salaryMax: 700000,
    closesInDays: 3,
    whyThisCouldFit: "Lead a team of six from day one",
    responsibilities: [
      "Manage and coach a support team of six",
      "Own response and resolution time targets",
      "Turn recurring issues into product feedback",
      "Build playbooks for common customer journeys",
    ],
    requirements: [
      "3+ years in customer support or success",
      "Experience managing or mentoring a team",
      "Calm, clear written communication",
      "Comfortable working onsite in Lagos",
    ],
    skills: ["Team Leadership", "Support Tools", "Reporting", "Escalations"],
  },
  {
    companyName: "Cowrywise",
    title: "Data Analyst",
    description:
      "Help a mission-driven fintech understand how people save and invest. A great first data role — we'll pair you with a senior analyst from week one.",
    location: "Remote",
    workArrangement: "Remote",
    jobType: "Full-time",
    experienceLevel: "Junior",
    careerPath: "Data",
    salaryMin: 400000,
    salaryMax: 600000,
    closesInDays: 8,
    whyThisCouldFit: "Mentorship built into the role",
    responsibilities: [
      "Build dashboards the product team uses weekly",
      "Answer questions about how customers save",
      "Keep data definitions consistent across teams",
      "Present findings to non-technical stakeholders",
    ],
    requirements: [
      "Comfortable writing SQL from scratch",
      "Some experience with Python or a BI tool",
      "Clear communicator — you can explain a chart",
      "Curious about personal finance",
    ],
    skills: ["SQL", "Python", "Dashboards", "Statistics"],
  },
  {
    companyName: "Flutterwave",
    title: "Backend Engineer",
    description:
      "Work on the payment infrastructure moving money across the continent. This is deep backend work where correctness and scale are the whole problem.",
    location: "Remote",
    workArrangement: "Remote",
    jobType: "Full-time",
    experienceLevel: "Senior",
    careerPath: "Engineering",
    salaryMin: 1100000,
    salaryMax: 1700000,
    closesInDays: 14,
    whyThisCouldFit: "Fully remote — work from anywhere in Nigeria",
    responsibilities: [
      "Design and ship services that move real money",
      "Own reliability, monitoring, and on-call for your services",
      "Improve throughput on latency-sensitive paths",
      "Review code and raise the bar across the team",
    ],
    requirements: [
      "5+ years building backend services in production",
      "Strong grasp of databases and data modelling",
      "Experience with distributed systems at scale",
      "Payments or fintech background is a plus",
    ],
    skills: ["Go", "PostgreSQL", "Kubernetes", "Redis", "gRPC"],
  },
  {
    companyName: "Moniepoint",
    title: "Junior UX Researcher",
    description:
      "Support the research that keeps our products grounded in real user needs. A great entry point into UX research on a team that takes it seriously.",
    location: "Remote",
    workArrangement: "Remote",
    jobType: "Contract",
    experienceLevel: "Junior",
    careerPath: "Design",
    salaryMin: 350000,
    salaryMax: 550000,
    closesInDays: 10,
    whyThisCouldFit: "Six-month contract with potential to extend",
    responsibilities: [
      "Recruit and schedule participants for studies",
      "Take structured notes during interviews",
      "Help synthesise findings into clear summaries",
      "Maintain the team's research repository",
    ],
    requirements: [
      "Some exposure to user research or a related field",
      "Excellent note-taking and written summaries",
      "Comfortable talking to strangers on a call",
      "Organised and reliable with scheduling",
    ],
    skills: ["User Interviews", "Note-taking", "Synthesis", "Figma"],
  },
];

async function seed() {
  try {
    await connectDB();

    // Start from a clean slate so re-running never creates duplicates
    console.log("Clearing old data...");
    await Job.deleteMany({});
    await Company.deleteMany({});

    // 1. Create the companies first — jobs need their ids
    console.log("Creating companies...");
    const createdCompanies = await Company.insertMany(
      companies.map((c) => ({
        ...c,
        slug: slugify(c.name),
        logoUrl: "/images/moniepoint_group_icon.svg",
      }))
    );

    // 2. Build a lookup table: { "Paystack": ObjectId(...), ... }
    // This saves us querying the database once per job.
    const companyIdByName = new Map(
      createdCompanies.map((c) => [c.name, c._id])
    );

    // 3. Create the jobs, swapping each company NAME for its real id
    console.log("Creating jobs...");
    await Job.insertMany(
      jobs.map((job, index) => {
        const { companyName, closesInDays, ...rest } = job;

        return {
          ...rest,
          company: companyIdByName.get(companyName),
          // Add the index so two jobs with the same title get different slugs
          slug: `${slugify(job.title)}-${slugify(companyName)}-${index + 1}`,
          closesAt: daysFromNow(closesInDays),
          currency: "₦",
          status: "open",
        };
      })
    );

    console.log(
      `Seeded ${createdCompanies.length} companies and ${jobs.length} jobs`
    );
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    // Always close the connection, or the script hangs forever
    await mongoose.connection.close();
    process.exit(0);
  }
}

seed();
