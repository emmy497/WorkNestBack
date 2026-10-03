import { Schema, model, Types } from "mongoose";
import {
  WORK_ARRANGEMENTS,
  JOB_TYPES,
  EXPERIENCE_LEVELS,
  CAREER_PATHS,
  WorkArrangement,
  JobType,
  ExperienceLevel,
  CareerPath,
} from "../types/enums";

// The shape of a job as it is stored in the database.
export interface IJob {
  // This is a REFERENCE to a document in the companies collection.
  // We store only its id here, not the whole company.
  company: Types.ObjectId;

  title: string;
  slug: string;
  description: string;

  // Arrays of plain strings, stored right inside the job document
  responsibilities: string[];
  requirements: string[];
  skills: string[];

  // What a candidate has to answer, beyond the fixed "why this role?"
  // question every application already asks. See Application.screeningAnswers
  // for where the candidate's answers end up.
  screeningQuestions: string[];

  numberOfPositions: number;

  // The four fields the filter sidebar uses
  location: string;
  workArrangement: WorkArrangement;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  careerPath: CareerPath;

  salaryMin: number;
  salaryMax: number;
  currency: string;

  whyThisCouldFit?: string;
  featured: boolean;
  status: "draft" | "open" | "closed" | "archived";

  // We store the DEADLINE, not "closes in 6 days".
  // "6 days" would be wrong tomorrow — a date is always correct.
  closesAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: "Company", // tells Mongoose which model this id points at
      required: true,
      index: true,
    },

    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },

    responsibilities: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    screeningQuestions: { type: [String], default: [] },
    numberOfPositions: { type: Number, default: 1 },

    location: { type: String, required: true },

    // `enum` means: only these exact values are allowed.
    // We pass in the same arrays we used to build the TypeScript types,
    // so the database rules and the types can never drift apart.
    workArrangement: {
      type: String,
      enum: WORK_ARRANGEMENTS,
      required: true,
      index: true,
    },
    jobType: { type: String, enum: JOB_TYPES, required: true, index: true },
    experienceLevel: {
      type: String,
      enum: EXPERIENCE_LEVELS,
      required: true,
      index: true,
    },
    careerPath: {
      type: String,
      enum: CAREER_PATHS,
      required: true,
      index: true,
    },

    salaryMin: { type: Number, required: true },
    salaryMax: { type: Number, required: true },
    currency: { type: String, default: "₦" },

    whyThisCouldFit: String,
    featured: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["draft", "open", "closed", "archived"],
      default: "open",
      index: true,
    },
    closesAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// An index makes searching fast. Without one, MongoDB reads EVERY job
// to answer a query. This one covers our most common lookup.
jobSchema.index({ status: 1, createdAt: -1 });

export const Job = model<IJob>("Job", jobSchema);
