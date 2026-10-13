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

export interface IJob {
  company: Types.ObjectId;

  title: string;
  slug: string;
  description: string;

  responsibilities: string[];
  requirements: string[];
  skills: string[];

  screeningQuestions: string[];

  numberOfPositions: number;

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

  closesAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: "Company",
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

jobSchema.index({ status: 1, createdAt: -1 });

export const Job = model<IJob>("Job", jobSchema);
