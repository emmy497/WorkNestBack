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

import { Company } from "../models/Company";
void Company;

type PopulatedJob = Omit<IJob, "company"> & {
  _id: Types.ObjectId;
  company: { _id: Types.ObjectId; name: string } | null;
};

export async function getAdminJobs(_req: Request, res: Response) {
  try {
    const [jobs, applicantCounts] = await Promise.all([
      Job.find()
        .populate({ path: "company", select: "name" })
        .sort({ createdAt: -1 })
        .lean<PopulatedJob[]>(),

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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

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
