import { Schema, model, Types } from "mongoose";

// The stages an application moves through, in order.
// These match APPLICATION_STAGES in the frontend's types/application.ts.
export const APPLICATION_STAGES = [
  "submitted",
  "review",
  "shortlisted",
  "interview",
  "offer",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

// "rejected" isn't a stage — it can happen at any point, so it's a separate
// terminal state rather than a sixth step on the line.
export type ApplicationStatus = ApplicationStage | "rejected";

// One entry per status change, so the candidate can see the full history.
export interface IStatusChange {
  status: ApplicationStatus;
  changedAt: Date;
  note?: string;
}

export interface IApplication {
  job: Types.ObjectId;
  applicant: Types.ObjectId;

  // A SNAPSHOT of the applicant's details at the moment they applied.
  //
  // We copy these rather than reading the live profile, because the
  // application should show what the company was actually sent. If someone
  // changes their phone number next month, this record shouldn't change.
  fullName: string;
  email: string;
  phone: string;
  location: string;

  cvUrl: string;
  cvOriginalName: string;
  portfolioLink: string;
  linkedin: string;

  yearsOfExperience: string;
  availability: string;
  expectedSalary: string;
  whyThisRole: string;

  status: ApplicationStatus;
  statusHistory: IStatusChange[];

  createdAt: Date;
  updatedAt: Date;
}

// A sub-schema for the history entries. `_id: false` because these are just
// log lines — they never need their own id.
const statusChangeSchema = new Schema<IStatusChange>(
  {
    status: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
    note: String,
  },
  { _id: false }
);

const applicationSchema = new Schema<IApplication>(
  {
    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    applicant: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    location: { type: String, default: "" },

    cvUrl: { type: String, default: "" },
    cvOriginalName: { type: String, default: "" },
    portfolioLink: { type: String, default: "" },
    linkedin: { type: String, default: "" },

    yearsOfExperience: { type: String, default: "" },
    availability: { type: String, default: "" },
    expectedSalary: { type: String, default: "" },

    // The only free-text answer we insist on — it's what a reviewer reads first.
    whyThisRole: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: [...APPLICATION_STAGES, "rejected"],
      default: "submitted",
      index: true,
    },
    statusHistory: { type: [statusChangeSchema], default: [] },
  },
  { timestamps: true }
);

// One application per person per job.
//
// A compound unique index: the COMBINATION must be unique. One person can
// apply to many jobs and a job gets many applicants, but nobody can apply
// to the same role twice — enforced by the database, not just our code.
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

export const Application = model<IApplication>(
  "Application",
  applicationSchema
);
