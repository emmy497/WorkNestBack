// These are the fixed sets of values a job can have.
//
// We write them ONCE here and use them in two places:
//   1. In the Mongoose schema, as the list of allowed values (runtime check)
//   2. As TypeScript types, so the compiler catches typos (compile-time check)
//
// `as const` is what makes that possible. Without it, TypeScript would see
// this as a plain `string[]`. With it, TypeScript remembers the exact values.

export const WORK_ARRANGEMENTS = ["Remote", "Hybrid", "Onsite"] as const;
export const JOB_TYPES = ["Full-time", "Contract", "Internship"] as const;
export const EXPERIENCE_LEVELS = ["Junior", "Mid-level", "Senior"] as const;
export const CAREER_PATHS = [
  "Design",
  "Engineering",
  "Data",
  "Customer",
  "Marketing",
] as const;

// `(typeof X)[number]` means "the type of one item in that array".
// So this becomes: "Remote" | "Hybrid" | "Onsite"
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];
export type JobType = (typeof JOB_TYPES)[number];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type CareerPath = (typeof CAREER_PATHS)[number];
