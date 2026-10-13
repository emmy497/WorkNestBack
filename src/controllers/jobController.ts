import { Request, Response } from "express";
import { Types } from "mongoose";
import { Job, IJob } from "../models/Job";

import { Company, ICompany } from "../models/Company";
void Company;

export type JobWithCompany = Omit<IJob, "company"> & {
  _id: Types.ObjectId;
  company: (ICompany & { _id: Types.ObjectId }) | null;
};

export function toClientJob(job: JobWithCompany) {
  const MS_IN_A_DAY = 1000 * 60 * 60 * 24;

  const closesInDays = Math.max(
    0,
    Math.ceil((new Date(job.closesAt).getTime() - Date.now()) / MS_IN_A_DAY)
  );

  const postedDaysAgo = Math.max(
    1,
    Math.floor((Date.now() - new Date(job.createdAt).getTime()) / MS_IN_A_DAY)
  );

  return {
    id: job._id.toString(),
    companyName: job.company?.name ?? "Unknown",
    companyLogo: job.company?.logoUrl ?? "",
    title: job.title,
    description: job.description,
    location: job.location,
    workArrangement: job.workArrangement,
    jobType: job.jobType,
    experienceLevel: job.experienceLevel,
    careerPath: job.careerPath,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    featured: job.featured,
    responsibilities: job.responsibilities,
    requirements: job.requirements,
    skills: job.skills,
    screeningQuestions: job.screeningQuestions ?? [],
    whyThisCouldFit: job.whyThisCouldFit ?? "",
    closesInDays,
    postedDaysAgo,
  };
}

export async function getJobs(req: Request, res: Response) {
  try {
    const jobs = await Job.find({ status: "open", closesAt: { $gte: new Date() } })
      .populate("company", "name logoUrl")
      .sort({ featured: -1, createdAt: -1 })
      .lean<JobWithCompany[]>();

    res.json(jobs.map(toClientJob));
  } catch (error) {
    console.error("getJobs failed:", error);
    res.status(500).json({ message: "Could not load jobs" });
  }
}

export async function getJobById(req: Request, res: Response) {
  try {
    const id = String(req.params.id);

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "That job id is not valid" });
    }

    const job = await Job.findById(id)
      .populate("company", "name logoUrl website about")
      .lean<JobWithCompany>();

     

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.json(toClientJob(job));
  } catch (error) {
    console.error("getJobById failed:", error);
    res.status(500).json({ message: "Could not load that job" });
  }
}
