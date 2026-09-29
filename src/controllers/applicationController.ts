import { Request, Response } from "express";
import { Types } from "mongoose";

import { Application, IApplication } from "../models/Application";
import { Job, IJob } from "../models/Job";
import { User } from "../models/User";
import { toClientJob, JobWithCompany } from "./jobController";
import { sendApplicationEmail } from "../services/emailService";

// Needed so .populate() can find these models — see the note in
// jobController about type-only imports being stripped at compile time.
import { Company } from "../models/Company";
void Company;

// After .populate("job"), the job field holds a whole job document instead
// of just its id. This type describes an application in that shape.
type ApplicationWithJob = Omit<IApplication, "job"> & {
  _id: Types.ObjectId;
  job: JobWithCompany | null;
};

// Turn a database application into what the React app expects.
// The frontend's Application type wants a nested `job` and an ISO date.
function toClientApplication(app: ApplicationWithJob) {
  return {
    id: String(app._id),
    job: app.job ? toClientJob(app.job) : null,
    status: app.status,
    appliedAt: new Date(app.createdAt).toISOString(),
    statusMessage: statusMessageFor(app.status),

    // What the company was sent, so the candidate can look back at it
    fullName: app.fullName,
    email: app.email,
    phone: app.phone,
    location: app.location,
    cvOriginalName: app.cvOriginalName,
    portfolioLink: app.portfolioLink,
    linkedin: app.linkedin,
    yearsOfExperience: app.yearsOfExperience,
    availability: app.availability,
    expectedSalary: app.expectedSalary,
    whyThisRole: app.whyThisRole,
  };
}

// A plain-English line describing where the application stands.
function statusMessageFor(status: IApplication["status"]): string {
  switch (status) {
    case "submitted":
      return "Your application is in. A real person will review it shortly.";
    case "review":
      return "Someone on our team is reading your application right now.";
    case "shortlisted":
      return "You've been shortlisted and passed on to the company.";
    case "interview":
      return "The company would like to interview you.";
    case "offer":
      return "You have an offer. Congratulations.";
    case "hired":
      return "You're hired. Welcome to the team.";
    case "rejected":
      return "You weren't selected for this role this time.";
  }
}

// ---------------------------------------------------------------------------
// POST /api/applications/:jobId
//
// Submits an application. Everything in the wizard arrives in one request.
// ---------------------------------------------------------------------------
export async function createApplication(req: Request, res: Response) {
  try {
    const jobId = String(req.params.jobId);

    if (!Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "That job id is not valid" });
    }

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Don't accept applications for a role that has closed.
    if (job.status !== "open" || job.closesAt.getTime() < Date.now()) {
      return res
        .status(400)
        .json({ message: "This role is no longer accepting applications" });
    }

    // Already applied? 409 means "conflict" — the request was fine, it just
    // clashes with something that already exists. Only checked for a
    // logged-in candidate — a guest has no account to check against, and
    // leaving this unguarded would matter: Mongoose drops an `undefined`
    // field from a query, so { job, applicant: undefined } would silently
    // become { job } alone and match ANY existing applicant on this job.
    if (req.userId) {
      const existing = await Application.findOne({
        job: jobId,
        applicant: req.userId,
      });

      if (existing) {
        return res
          .status(409)
          .json({ message: "You've already applied to this role" });
      }
    }

    const {
      fullName,
      email,
      phone,
      location,
      cvUrl,
      cvOriginalName,
      portfolioLink,
      linkedin,
      yearsOfExperience,
      availability,
      expectedSalary,
      whyThisRole,
    } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    if (!whyThisRole || !String(whyThisRole).trim()) {
      return res
        .status(400)
        .json({ message: "Please tell us why you're interested in this role" });
    }

    const application = await Application.create({
      job: jobId,
      applicant: req.userId || undefined,

      fullName,
      email,
      phone: phone ?? "",
      location: location ?? "",

      cvUrl: cvUrl ?? "",
      cvOriginalName: cvOriginalName ?? "",
      portfolioLink: portfolioLink ?? "",
      linkedin: linkedin ?? "",

      yearsOfExperience: yearsOfExperience ?? "",
      availability: availability ?? "",
      expectedSalary: expectedSalary ?? "",
      whyThisRole: String(whyThisRole).trim(),

      status: "submitted",
      statusHistory: [{ status: "submitted", changedAt: new Date() }],
    });

    // Answer the browser FIRST. The application is safely saved, so there's
    // no reason to make the candidate watch a spinner while an email sends.
    res.status(201).json({
      message: "Application submitted",
      applicationId: String(application._id),
    });

    // Now the email, after the response has already gone out.
    //
    // Everything about sending lives inside this helper, including the
    // company lookup. That matters: if the lookup or the send fails, it must
    // not turn an application that genuinely succeeded into an error. We log
    // the problem instead — the candidate keeps their 201 either way.
    sendApplicationConfirmation(application, job).catch((error) => {
      console.error(
        `Could not send application email to ${application.email}:`,
        error
      );
    });
  } catch (error) {
    console.error("createApplication failed:", error);

    // We send the 201 before the email now, so by the time something goes
    // wrong here a reply may already be on its way. Trying to send a second
    // one crashes with "Cannot set headers after they are sent".
    if (!res.headersSent) {
      res.status(500).json({ message: "Could not submit your application" });
    }
  }
}

// Builds and sends the "we got your application" email.
//
// Kept separate from the controller because it runs AFTER the response has
// been sent, and nothing in here is allowed to affect what the candidate
// already saw.
async function sendApplicationConfirmation(
  application: IApplication,
  job: IJob
) {
  // We need the company NAME, but job.company is only an id — so fetch just
  // that one field rather than pulling down the whole document.
  const company = await Company.findById(job.company).select("name").lean();

  await sendApplicationEmail({
    email: application.email,
    name: application.fullName,
    jobTitle: job.title,
    companyName: company?.name ?? "the company",
    location: job.location,
    expectedSalary: application.expectedSalary,
  });
}

// ---------------------------------------------------------------------------
// GET /api/applications
//
// The logged-in user's applications, newest first.
// ---------------------------------------------------------------------------
export async function getMyApplications(req: Request, res: Response) {
  try {
    const applications = await Application.find({ applicant: req.userId })
      .populate({
        path: "job",
        populate: { path: "company", select: "name logoUrl" },
      })
      .sort({ createdAt: -1 })
      .lean<ApplicationWithJob[]>();

    // Skip any whose job has since been deleted, rather than sending nulls
    // the frontend would have to guard against.
    res.json(
      applications.filter((app) => app.job !== null).map(toClientApplication)
    );
  } catch (error) {
    console.error("getMyApplications failed:", error);
    res.status(500).json({ message: "Could not load your applications" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/applications/job/:jobId
//
// Has the user already applied to this job? The Apply page calls this so it
// can stop someone filling in the whole wizard only to be rejected at the end.
// ---------------------------------------------------------------------------
export async function getApplicationForJob(req: Request, res: Response) {
  try {
    const jobId = String(req.params.jobId);

    if (!Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "That job id is not valid" });
    }

    const existing = await Application.findOne({
      job: jobId,
      applicant: req.userId,
    }).lean();

    res.json({
      applied: existing !== null,
      applicationId: existing ? String(existing._id) : null,
    });
  } catch (error) {
    console.error("getApplicationForJob failed:", error);
    res.status(500).json({ message: "Could not check that role" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/applications/prefill
//
// The profile fields the wizard uses to fill itself in, so the candidate
// doesn't retype what we already know. "Set it up once."
// ---------------------------------------------------------------------------
export async function getApplicationPrefill(req: Request, res: Response) {
  try {
    const user = await User.findById(req.userId).lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      fullName: user.name ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      location: user.location ?? "",
      cvUrl: user.cvUrl ?? "",
      cvOriginalName: user.cvOriginalName ?? "",
      portfolioLink: user.portfolioLink ?? "",
      linkedin: user.linkedin ?? "",
      yearsOfExperience: user.yearsOfExperience ?? "",
      availability: user.availability ?? "",
    });
  } catch (error) {
    console.error("getApplicationPrefill failed:", error);
    res.status(500).json({ message: "Could not load your details" });
  }
}
