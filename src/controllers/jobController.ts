import { Request, Response } from "express";
import { Types } from "mongoose";
import { Job, IJob } from "../models/Job";

// We import `Company` (the model itself, not just its type) even though we
// never call Company.find() here.
//
// Why: .populate("company") asks Mongoose for a model registered under the
// name "Company". That registration only happens when the file runs. If we
// imported ONLY the ICompany type, TypeScript would delete the import when
// compiling — the file would never run, and populate would fail at runtime.
import { Company, ICompany } from "../models/Company";
void Company; // tells linters this import is intentional

// ---------------------------------------------------------------------------
// A small helper type.
//
// Normally `job.company` is just an id. But when we use .populate("company"),
// Mongoose swaps that id for the whole company document. This type describes
// a job AFTER that swap has happened.
//
// `Omit<IJob, "company">` means "everything in IJob except company",
// and then we add company back with a different type.
// ---------------------------------------------------------------------------
export type JobWithCompany = Omit<IJob, "company"> & {
  _id: Types.ObjectId;
  company: (ICompany & { _id: Types.ObjectId }) | null;
};

// ---------------------------------------------------------------------------
// Turn a database job into the exact shape the React app expects.
//
// The database and the frontend do NOT have to look the same, and they
// shouldn't. The database stores `closesAt` (a date); the frontend wants
// `closesInDays` (a number). This function is the translator between them.
// ---------------------------------------------------------------------------
export function toClientJob(job: JobWithCompany) {
  const MS_IN_A_DAY = 1000 * 60 * 60 * 24;

  // How many days until this job closes? Never negative.
  const closesInDays = Math.max(
    0,
    Math.ceil((new Date(job.closesAt).getTime() - Date.now()) / MS_IN_A_DAY)
  );

  // How many days ago was it posted? At least 1, so we never say "0 days ago".
  const postedDaysAgo = Math.max(
    1,
    Math.floor((Date.now() - new Date(job.createdAt).getTime()) / MS_IN_A_DAY)
  );

  return {
    id: job._id.toString(), // MongoDB ids are objects — the frontend wants a string
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
    whyThisCouldFit: job.whyThisCouldFit ?? "",
    closesInDays,
    postedDaysAgo,
  };
}

// ---------------------------------------------------------------------------
// GET /api/jobs
// Returns every open job.
// ---------------------------------------------------------------------------
export async function getJobs(req: Request, res: Response) {
  try {
    const jobs = await Job.find({ status: "open" })
      // .populate() swaps the company id for the real company document.
      // The second argument lists the only fields we actually need.
      .populate("company", "name logoUrl")
      // -1 means newest first. Featured jobs come first of all.
      .sort({ featured: -1, createdAt: -1 })
      // .lean() gives us plain JavaScript objects instead of full Mongoose
      // documents. Faster, and we're only reading — not saving anything.
      .lean<JobWithCompany[]>();

    // Translate each one into the shape the frontend wants
    res.json(jobs.map(toClientJob));
  } catch (error) {
    console.error("getJobs failed:", error);
    res.status(500).json({ message: "Could not load jobs" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/jobs/:id
// Returns one job, for the details page.
// ---------------------------------------------------------------------------
export async function getJobById(req: Request, res: Response) {
  try {
    // req.params values are typed as string | string[] in Express 5,
    // so we narrow to a string before using it.
    const id = String(req.params.id);

    // If someone visits /api/jobs/banana, `id` is not a valid MongoDB id.
    // Without this check Mongoose throws a confusing CastError.
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "That job id is not valid" });
    }

    const job = await Job.findById(id)
      .populate("company", "name logoUrl website about")
      .lean<JobWithCompany>();

     

    // findById returns null when nothing matches — that's a 404, not an error.
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.json(toClientJob(job));
  } catch (error) {
    console.error("getJobById failed:", error);
    res.status(500).json({ message: "Could not load that job" });
  }
}
