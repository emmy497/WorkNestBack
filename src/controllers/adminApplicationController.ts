import { Request, Response } from "express";
import { Types } from "mongoose";

import {
  Application,
  IApplication,
  APPLICATION_STAGES,
  ApplicationStage,
  ApplicationStatus,
} from "../models/Application";
import { sendApplicationStatusEmail } from "../services/emailService";

// Needed so .populate() can find these models — see the note in
// jobController about type-only imports being stripped at compile time.
import { Company } from "../models/Company";
import { User } from "../models/User";
void Company;
void User;

// Applications created before scorecard/internalNote existed on the schema
// don't have them in the database, and .lean() (used below) skips schema
// defaults entirely for fields missing from the raw row — so app.scorecard
// can genuinely be undefined here even though IApplication says otherwise.
const DEFAULT_SCORECARD: IApplication["scorecard"] = {
  skillsMatch: 0,
  experience: 0,
  communication: 0,
  portfolioWork: 0,
};

// After .populate(), these fields hold whole documents instead of ids.
type PopulatedApplication = Omit<IApplication, "job" | "applicant"> & {
  _id: Types.ObjectId;
  job: { _id: Types.ObjectId; title: string; company: { _id: Types.ObjectId; name: string } | null } | null;
  applicant: { _id: Types.ObjectId; name: string; email: string; headline?: string } | null;
};

// Average of the 4 ratings, one decimal place — or null if the candidate
// hasn't been rated at all yet, so the pipeline table can show "Not scored"
// instead of a misleading 0.0. Mirrors the same math in the frontend's
// ApplicationReview.tsx so the list and detail views never disagree.
function overallScore(scorecard: IApplication["scorecard"] | undefined): number | null {
  const card = scorecard ?? DEFAULT_SCORECARD;
  const values = Object.values(card);
  const sum = values.reduce((total, v) => total + v, 0);

  if (sum === 0) return null;
  return Math.round((sum / values.length) * 10) / 10;
}

// The list view only needs enough to render a row — full candidate detail
// (CV, notes, history) is fetched separately by the review page.
function toListItem(app: PopulatedApplication) {
  return {
    id: String(app._id),
    candidateName: app.fullName,
    candidateHeadline: app.applicant?.headline ?? "",
    jobId: app.job ? String(app.job._id) : null,
    jobTitle: app.job?.title ?? "Unknown role",
    companyName: app.job?.company?.name ?? "",
    status: app.status,
    score: overallScore(app.scorecard),
    appliedAt: new Date(app.createdAt).toISOString(),
  };
}

// The review page needs everything — this is the only place internalNote
// and scorecard are ever sent over the wire, and only to an admin/recruiter
// (every route in adminApplicationRoutes.ts is gated by authorize()).
function toDetail(app: PopulatedApplication) {
  return {
    id: String(app._id),
    status: app.status,
    // What "advance" should move this to next, and its label — computed
    // here so the frontend doesn't have to duplicate the stage ordering.
    // null once there's nowhere further to go (offer or rejected).
    nextStage: nextStage(app.status),
    statusHistory: app.statusHistory.map((entry) => ({
      status: entry.status,
      changedAt: new Date(entry.changedAt).toISOString(),
      note: entry.note ?? "",
    })),
    appliedAt: new Date(app.createdAt).toISOString(),

    fullName: app.fullName,
    // The headline lives on the live profile, not the application snapshot
    // (unlike fullName/email/etc — see the comment on IApplication), so it
    // reflects whatever the candidate's profile says today.
    candidateHeadline: app.applicant?.headline ?? "",
    email: app.email,
    phone: app.phone,
    location: app.location,

    cvUrl: app.cvUrl,
    cvOriginalName: app.cvOriginalName,
    portfolioLink: app.portfolioLink,
    linkedin: app.linkedin,

    yearsOfExperience: app.yearsOfExperience,
    availability: app.availability,
    expectedSalary: app.expectedSalary,
    whyThisRole: app.whyThisRole,

    scorecard: app.scorecard ?? DEFAULT_SCORECARD,
    internalNote: app.internalNote ?? "",

    job: app.job
      ? {
          id: String(app.job._id),
          title: app.job.title,
          companyName: app.job.company?.name ?? "",
        }
      : null,
  };
}

const populateOpts = [
  {
    path: "job" as const,
    select: "title company",
    populate: { path: "company", select: "name" },
  },
  { path: "applicant" as const, select: "name email headline" },
];

// ---------------------------------------------------------------------------
// GET /api/admin/applications
//
// Every application, newest first. `?status=shortlisted` narrows it down —
// used by the pipeline view to show one stage at a time.
// ---------------------------------------------------------------------------
export async function getAllApplications(req: Request, res: Response) {
  try {
    const { status } = req.query;

    const filter: Record<string, unknown> = {};
    if (status && typeof status === "string") {
      filter.status = status;
    }

    const applications = await Application.find(filter)
      .populate(populateOpts)
      .sort({ createdAt: -1 })
      .lean<PopulatedApplication[]>();

    res.json(applications.map(toListItem));
  } catch (error) {
    console.error("getAllApplications failed:", error);
    res.status(500).json({ message: "Could not load applications" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/applications/:id
// ---------------------------------------------------------------------------
export async function getApplicationById(req: Request, res: Response) {
  try {
    const id = String(req.params.id);

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "That application id is not valid" });
    }

    const application = await Application.findById(id)
      .populate(populateOpts)
      .lean<PopulatedApplication | null>();

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.json(toDetail(application));
  } catch (error) {
    console.error("getApplicationById failed:", error);
    res.status(500).json({ message: "Could not load that application" });
  }
}

// The order a "move to next stage" action follows. Rejection is deliberately
// not part of this — you can reject from any stage, but you never "advance"
// into it, so it's handled as its own explicit status value instead.
function nextStage(current: ApplicationStatus): ApplicationStage | null {
  if (current === "rejected") return null;

  const index = APPLICATION_STAGES.indexOf(current as ApplicationStage);
  if (index === -1 || index === APPLICATION_STAGES.length - 1) return null;

  return APPLICATION_STAGES[index + 1];
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/applications/:id/status
//
// Body: { status, note? }. `status` must be one of APPLICATION_STAGES or
// "rejected" — anything else is rejected with 400 rather than silently
// stored, since a typo here would otherwise corrupt the pipeline counts.
// ---------------------------------------------------------------------------
const VALID_STATUSES = [...APPLICATION_STAGES, "rejected"] as const;

export async function updateApplicationStatus(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const { status, note } = req.body as { status?: string; note?: string };

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "That application id is not valid" });
    }

    if (!status || !VALID_STATUSES.includes(status as ApplicationStatus)) {
      return res.status(400).json({
        message: `status must be one of: ${VALID_STATUSES.join(", ")}`,
      });
    }

    const application = await Application.findById(id).populate(populateOpts);

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    const populated = application as unknown as PopulatedApplication;

    application.status = status as ApplicationStatus;
    application.statusHistory.push({
      status: status as ApplicationStatus,
      changedAt: new Date(),
      note: note?.trim() || undefined,
    });

    await application.save();

    // Answer the browser first — same reasoning as createApplication: a
    // slow or failing email send must never turn a real status change into
    // an error response.
    // `application` is a hydrated Mongoose document, not a plain object.
    // Spreading it ({ ...application }) copies only Mongoose's internals —
    // $__, $isNew and _doc — and none of the field values, so toDetail() read
    // an undefined createdAt and threw "Invalid time value". That threw BEFORE
    // the status email below could be sent, which is why a shortlist saved to
    // the database but came back as a 500 and never emailed the candidate.
    // Field access goes through the schema's getters, so pass it straight in.
    res.json(toDetail(populated));

    // "submitted" has no email of its own (that's sendApplicationEmail, sent
    // at the moment of applying) — every other status gets one.
    if (status !== "submitted" && populated.job) {
      sendApplicationStatusEmail({
        email: application.email,
        name: application.fullName,
        jobTitle: populated.job.title,
        companyName: populated.job.company?.name ?? "the company",
        status: status as "review" | "shortlisted" | "interview" | "offer" | "hired" | "rejected",
        note: note?.trim() || undefined,
      }).catch((error) => {
        console.error(
          `Could not send status update email to ${application.email}:`,
          error
        );
      });
    }
  } catch (error) {
    console.error("updateApplicationStatus failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Could not update this application" });
    }
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/applications/:id/scorecard
//
// Saves the reviewer's star ratings and internal note. Deliberately separate
// from updateApplicationStatus — scoring a candidate shouldn't move them
// through the pipeline (and shouldn't email them) on its own.
// ---------------------------------------------------------------------------
export async function updateApplicationScorecard(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const { skillsMatch, experience, communication, portfolioWork, internalNote } =
      req.body as {
        skillsMatch?: number;
        experience?: number;
        communication?: number;
        portfolioWork?: number;
        internalNote?: string;
      };

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "That application id is not valid" });
    }

    const clamp = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : undefined;

    const application = await Application.findById(id).populate(populateOpts);

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    // Belt and suspenders: this is a hydrated (non-lean) document, so Mongoose
    // should already have cast a missing `scorecard` into its sub-schema
    // defaults — but an application saved before that field existed is exactly
    // the case most likely to surprise us here, so don't assume it's set.
    if (!application.scorecard) {
      application.scorecard = { ...DEFAULT_SCORECARD };
    }

    const skills = clamp(skillsMatch);
    const exp = clamp(experience);
    const comm = clamp(communication);
    const portfolio = clamp(portfolioWork);

    if (skills !== undefined) application.scorecard.skillsMatch = skills;
    if (exp !== undefined) application.scorecard.experience = exp;
    if (comm !== undefined) application.scorecard.communication = comm;
    if (portfolio !== undefined) application.scorecard.portfolioWork = portfolio;
    if (typeof internalNote === "string") application.internalNote = internalNote;

    await application.save();

    res.json(toDetail(application as unknown as PopulatedApplication));
  } catch (error) {
    console.error("updateApplicationScorecard failed:", error);
    res.status(500).json({ message: "Could not save your changes" });
  }
}

