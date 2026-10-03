import { Request, Response } from "express";
import { Types } from "mongoose";

import { Job, IJob } from "../models/Job";
import { Application } from "../models/Application";
import {
  WORK_ARRANGEMENTS,
  JOB_TYPES,
  EXPERIENCE_LEVELS,
  CAREER_PATHS,
} from "../types/enums";

// Needed so .populate() can find this model — see the note in jobController
// about type-only imports being stripped at compile time.
import { Company } from "../models/Company";
void Company;

type PopulatedJob = Omit<IJob, "company"> & {
  _id: Types.ObjectId;
  company: { _id: Types.ObjectId; name: string } | null;
};

// ---------------------------------------------------------------------------
// GET /api/admin/jobs
//
// Every job, regardless of status — unlike the public getJobs in
// jobController.ts, which only ever shows "open" ones. Admins need to see
// drafts, closed and archived roles too, which is why this doesn't just
// reuse that function or its toClientJob shaping (that one also computes
// candidate-facing fields like closesInDays this table doesn't use, and
// never exposes the raw status at all).
// ---------------------------------------------------------------------------
export async function getAdminJobs(_req: Request, res: Response) {
  try {
    const [jobs, applicantCounts] = await Promise.all([
      Job.find()
        .populate({ path: "company", select: "name" })
        .sort({ createdAt: -1 })
        .lean<PopulatedJob[]>(),

      // One aggregate for every job's applicant count, rather than one
      // query per row — same idiom dashboardController.ts uses.
      Application.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $group: { _id: "$job", count: { $sum: 1 } } },
      ]),
    ]);

    const countFor = (jobId: Types.ObjectId) =>
      applicantCounts.find((row) => String(row._id) === String(jobId))?.count ?? 0;

    res.json(
      jobs.map((job) => ({
        id: String(job._id),
        title: job.title,
        companyName: job.company?.name ?? "Unknown",
        jobType: job.jobType,
        status: job.status,
        applicantCount: countFor(job._id),
        closesAt: new Date(job.closesAt).toISOString(),
        createdAt: new Date(job.createdAt).toISOString(),
      }))
    );
  } catch (error) {
    console.error("getAdminJobs failed:", error);
    res.status(500).json({ message: "Could not load jobs" });
  }
}

// Turns "Frontend Engineer" into "frontend-engineer" — same idea seed.ts
// uses, but exported from nowhere shared since this is the only other place
// a slug ever gets generated.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Unlike seed.ts (which runs once against an empty collection), admin-created
// titles can collide — two "Frontend Engineer" postings, say — so the base
// slug gets a numeric suffix appended until it's actually free.
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;

  while (await Job.exists({ slug: candidate })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// POST /api/admin/jobs
//
// Creates a job as either a draft or published, depending on `action`.
// Both buttons on the New Role form submit the exact same payload — only
// the resulting status differs.
// ---------------------------------------------------------------------------
export async function createJob(req: Request, res: Response) {
  try {
    const {
      title,
      companyId,
      location,
      workArrangement,
      jobType,
      experienceLevel,
      careerPath,
      description,
      responsibilities,
      requirements,
      skills,
      salaryMin,
      salaryMax,
      numberOfPositions,
      closesAt,
      screeningQuestions,
      action,
    } = req.body;

    if (
      !isNonEmptyString(title) ||
      !isNonEmptyString(companyId) ||
      !isNonEmptyString(location) ||
      !isNonEmptyString(description) ||
      !isNonEmptyString(closesAt)
    ) {
      return res.status(400).json({
        message: "Title, client, location, description and a deadline are all required",
      });
    }

    if (!Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: "That client is not valid" });
    }

    if (!(await Company.exists({ _id: companyId }))) {
      return res.status(404).json({ message: "That client could not be found" });
    }

    if (!WORK_ARRANGEMENTS.includes(workArrangement)) {
      return res.status(400).json({ message: "Choose a valid work arrangement" });
    }
    if (!JOB_TYPES.includes(jobType)) {
      return res.status(400).json({ message: "Choose a valid job type" });
    }
    if (!EXPERIENCE_LEVELS.includes(experienceLevel)) {
      return res.status(400).json({ message: "Choose a valid experience level" });
    }
    if (!CAREER_PATHS.includes(careerPath)) {
      return res.status(400).json({ message: "Choose a valid career path" });
    }

    const min = Number(salaryMin);
    const max = Number(salaryMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) {
      return res.status(400).json({ message: "Enter a valid salary range" });
    }

    const deadline = new Date(closesAt);
    if (Number.isNaN(deadline.getTime())) {
      return res.status(400).json({ message: "Enter a valid application deadline" });
    }

    const status = action === "publish" ? "open" : "draft";
    const slug = await uniqueSlug(title);

    const job = await Job.create({
      company: companyId,
      title: title.trim(),
      slug,
      description,
      responsibilities: Array.isArray(responsibilities) ? responsibilities : [],
      requirements: Array.isArray(requirements) ? requirements : [],
      skills: Array.isArray(skills) ? skills : [],
      screeningQuestions: Array.isArray(screeningQuestions)
        ? screeningQuestions.filter(isNonEmptyString)
        : [],
      location,
      workArrangement,
      jobType,
      experienceLevel,
      careerPath,
      salaryMin: min,
      salaryMax: max,
      numberOfPositions: Number(numberOfPositions) > 0 ? Number(numberOfPositions) : 1,
      closesAt: deadline,
      status,
    });

    res.status(201).json({ jobId: String(job._id) });
  } catch (error) {
    console.error("createJob failed:", error);
    res.status(500).json({ message: "Could not create this job" });
  }
}
