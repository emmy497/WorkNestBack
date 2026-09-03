import { Request, Response } from "express";
import { Types } from "mongoose";

import { SavedJob } from "../models/SavedJob";
import { Job } from "../models/Job";
import { toClientJob, JobWithCompany } from "./jobController";

// We import Company for the same reason jobController does: .populate()
// needs the model to have been registered, which only happens when its
// file actually runs. A type-only import would be deleted at compile time.
import { Company } from "../models/Company";
void Company;

// Every route in this file runs behind the `protect` middleware, so
// req.userId is always set by the time we get here.

// ---------------------------------------------------------------------------
// GET /api/saved-jobs
//
// Returns the user's saved jobs, as full job objects ready to render.
// ---------------------------------------------------------------------------
export async function getSavedJobs(req: Request, res: Response) {
  try {
    const saved = await SavedJob.find({ user: req.userId })
      // Swap the job id for the whole job, and inside that, the company too.
      .populate({
        path: "job",
        populate: { path: "company", select: "name logoUrl" },
      })
      .sort({ createdAt: -1 }) // most recently saved first
      .lean();

    // A job could have been deleted since it was saved, leaving `job: null`.
    // Filter those out rather than crashing on the next line.
    const jobs = saved
      .map((entry) => entry.job as unknown as JobWithCompany | null)
      .filter((job): job is JobWithCompany => job !== null)
      .map(toClientJob);

    res.json(jobs);
  } catch (error) {
    console.error("getSavedJobs failed:", error);
    res.status(500).json({ message: "Could not load your saved jobs" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/saved-jobs/ids
//
// Just the ids, nothing else. The job list uses this to know which
// bookmark icons to fill in, without downloading every saved job.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /api/saved-jobs/:jobId
//
// Saves a job. Tapping it twice is harmless — see the note on upsert below.
// ---------------------------------------------------------------------------
export async function saveJob(req: Request, res: Response) {
  try {
    const jobId = String(req.params.jobId);

    if (!Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "That job id is not valid" });
    }

    // Don't let someone save a job that doesn't exist.
    const jobExists = await Job.exists({ _id: jobId });

    if (!jobExists) {
      return res.status(404).json({ message: "Job not found" });
    }

    // `upsert: true` means "update if it exists, otherwise insert".
    //
    // This makes the request idempotent: sending it five times leaves exactly
    // one row, so a double-tapped bookmark can't cause an error.
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

// ---------------------------------------------------------------------------
// DELETE /api/saved-jobs/:jobId
//
// Removes a job from the user's saved list.
// ---------------------------------------------------------------------------
export async function unsaveJob(req: Request, res: Response) {
  try {
    const jobId = String(req.params.jobId);

    if (!Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "That job id is not valid" });
    }

    // Note we match on BOTH user and job. Without the user check, anyone
    // could delete anyone else's saved job by guessing an id.
    await SavedJob.deleteOne({ user: req.userId, job: jobId });

    // We don't 404 when there was nothing to delete — the end result the
    // caller wanted ("this job is not saved") is true either way.
    res.json({ saved: false, jobId });
  } catch (error) {
    console.error("unsaveJob failed:", error);
    res.status(500).json({ message: "Could not remove that job" });
  }
}
