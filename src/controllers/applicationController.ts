import { Request, Response } from "express";
import { Types } from "mongoose";

import { Application, IApplication } from "../models/Application";
import { Job, IJob } from "../models/Job";
import { User } from "../models/User";
import { toClientJob, JobWithCompany } from "./jobController";
import { sendApplicationEmail } from "../services/emailService";
import { uploadBufferToCloudinary } from "../config/cloudinary";

import { Company } from "../models/Company";
void Company;

type ApplicationWithJob = Omit<IApplication, "job"> & {
  _id: Types.ObjectId;
  job: JobWithCompany | null;
};

function toClientApplication(app: ApplicationWithJob) {
  return {
    id: String(app._id),
    job: app.job ? toClientJob(app.job) : null,
    status: app.status,
    appliedAt: new Date(app.createdAt).toISOString(),
    statusMessage: statusMessageFor(app.status),

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

    if (job.status !== "open" || job.closesAt.getTime() < Date.now()) {
      return res
        .status(400)
        .json({ message: "This role is no longer accepting applications" });
    }

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
      screeningAnswers,
    } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    if (!whyThisRole || !String(whyThisRole).trim()) {
      return res
        .status(400)
        .json({ message: "Please tell us why you're interested in this role" });
    }

    const answers: { question: string; answer: string }[] = Array.isArray(screeningAnswers)
      ? screeningAnswers
      : [];

    if (job.screeningQuestions.length > 0) {
      const hasAllAnswers =
        answers.length === job.screeningQuestions.length &&
        answers.every((a) => a?.answer && String(a.answer).trim());

      if (!hasAllAnswers) {
        return res
          .status(400)
          .json({ message: "Please answer every screening question" });
      }
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
      screeningAnswers: answers.map((a) => ({
        question: String(a.question),
        answer: String(a.answer).trim(),
      })),

      status: "submitted",
      statusHistory: [{ status: "submitted", changedAt: new Date() }],
    });

    res.status(201).json({
      message: "Application submitted",
      applicationId: String(application._id),
    });

    sendApplicationConfirmation(application, job).catch((error) => {
      console.error(
        `Could not send application email to ${application.email}:`,
        error
      );
    });
  } catch (error) {
    console.error("createApplication failed:", error);

    if (!res.headersSent) {
      res.status(500).json({ message: "Could not submit your application" });
    }
  }
}

async function sendApplicationConfirmation(
  application: IApplication,
  job: IJob
) {
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

export async function getMyApplications(req: Request, res: Response) {
  try {
    const applications = await Application.find({ applicant: req.userId })
      .populate({
        path: "job",
        populate: { path: "company", select: "name logoUrl" },
      })
      .sort({ createdAt: -1 })
      .lean<ApplicationWithJob[]>();

    res.json(
      applications.filter((app) => app.job !== null).map(toClientApplication)
    );
  } catch (error) {
    console.error("getMyApplications failed:", error);
    res.status(500).json({ message: "Could not load your applications" });
  }
}

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

export async function uploadApplicationCv(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file was uploaded" });
    }

    const { secureUrl } = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "worknest/cvs",
      filename: `${req.userId ?? "guest"}-${Date.now()}`,
    });

    res.status(201).json({ cvUrl: secureUrl, cvOriginalName: req.file.originalname });
  } catch (error) {
    console.error("uploadApplicationCv failed:", error);
    res.status(500).json({ message: "Could not upload your CV" });
  }
}
