import { Request, Response } from "express";
import { Types } from "mongoose";

import { SavedJob } from "../models/SavedJob";
import { Job } from "../models/Job";
import { toClientJob, JobWithCompany } from "./jobController";

import { Company } from "../models/Company";
void Company;


export async function getSavedJobs(req: Request, res: Response) {
  try {
    const saved = await SavedJob.find({ user: req.userId })
      .populate({
        path: "job",
        populate: { path: "company", select: "name logoUrl" },
      })
      .sort({ createdAt: -1 })
      .lean();

    const now = Date.now();
    const jobs = saved
      .map((entry) => entry.job as unknown as JobWithCompany | null)
      .filter((job): job is JobWithCompany => job !== null)
      .filter((job) => job.status === "open" && new Date(job.closesAt).getTime() >= now)
      .map(toClientJob);

    res.json(jobs);
  } catch (error) {
    console.error("getSavedJobs failed:", error);
    res.status(500).json({ message: "Could not load your saved jobs" });
  }
}

export async function getSavedJobIds(req: Request, res: Response) {
  try {
    const saved = await SavedJob.find({ user: req.userId })
      .select("job")
      .lean();

    res.json(saved.map((entry) => String(entry.job)));
  } catch (error) {
    console.error("getSavedJobIds failed:", error);
    res.status(500).json({ message: "Could not load your saved jobs" });
  }
}

export async function saveJob(req: Request, res: Response) {
  try {
    const jobId = String(req.params.jobId);

    if (!Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "That job id is not valid" });
    }

    const jobExists = await Job.exists({ _id: jobId });

    if (!jobExists) {
      return res.status(404).json({ message: "Job not found" });
    }

    await SavedJob.updateOne(
      { user: req.userId, job: jobId },
      { $setOnInsert: { user: req.userId, job: jobId } },
      { upsert: true }
    );

    res.status(201).json({ saved: true, jobId });
  } catch (error) {
    console.error("saveJob failed:", error);
    res.status(500).json({ message: "Could not save that job" });
  }
}

export async function unsaveJob(req: Request, res: Response) {
  try {
    const jobId = String(req.params.jobId);

    if (!Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "That job id is not valid" });
    }

    await SavedJob.deleteOne({ user: req.userId, job: jobId });

    res.json({ saved: false, jobId });
  } catch (error) {
    console.error("unsaveJob failed:", error);
    res.status(500).json({ message: "Could not remove that job" });
  }
}
