import { Schema, model, Types } from "mongoose";

export const APPLICATION_STAGES = [
  "submitted",
  "review",
  "shortlisted",
  "interview",
  "offer",
  "hired",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export type ApplicationStatus = ApplicationStage | "rejected";

export interface IStatusChange {
  status: ApplicationStatus;
  changedAt: Date;
  note?: string;
}

export interface IScorecard {
  skillsMatch: number;
  experience: number;
  communication: number;
  portfolioWork: number;
}

export interface IScreeningAnswer {
  question: string;
  answer: string;
}

export interface IApplication {
  job: Types.ObjectId;

  applicant?: Types.ObjectId;

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
  screeningAnswers: IScreeningAnswer[];

  status: ApplicationStatus;
  statusHistory: IStatusChange[];

  scorecard: IScorecard;
  internalNote: string;

  createdAt: Date;
  updatedAt: Date;
}

const statusChangeSchema = new Schema<IStatusChange>(
  {
    status: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
    note: String,
  },
  { _id: false }
);

const scorecardSchema = new Schema<IScorecard>(
  {
    skillsMatch: { type: Number, default: 0, min: 0, max: 5 },
    experience: { type: Number, default: 0, min: 0, max: 5 },
    communication: { type: Number, default: 0, min: 0, max: 5 },
    portfolioWork: { type: Number, default: 0, min: 0, max: 5 },
  },
  { _id: false }
);

const screeningAnswerSchema = new Schema<IScreeningAnswer>(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
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

    whyThisRole: { type: String, required: true, trim: true },
    screeningAnswers: { type: [screeningAnswerSchema], default: [] },

    status: {
      type: String,
      enum: [...APPLICATION_STAGES, "rejected"],
      default: "submitted",
      index: true,
    },
    statusHistory: { type: [statusChangeSchema], default: [] },

    scorecard: { type: scorecardSchema, default: () => ({}) },
    internalNote: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

applicationSchema.index(
  { job: 1, applicant: 1 },
  { unique: true, partialFilterExpression: { applicant: { $exists: true } } }
);

export const Application = model<IApplication>(
  "Application",
  applicationSchema
);
