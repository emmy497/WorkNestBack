export const WORK_ARRANGEMENTS = ["Remote", "Hybrid", "Onsite"] as const;
export const JOB_TYPES = ["Full-time", "Contract", "Internship", "Part-time"] as const;
export const EXPERIENCE_LEVELS = ["Junior", "Mid-level", "Senior"] as const;
export const CAREER_PATHS = [
  "Design",
  "Engineering",
  "Data",
  "Customer",
  "Marketing",
] as const;

export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];
export type JobType = (typeof JOB_TYPES)[number];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type CareerPath = (typeof CAREER_PATHS)[number];
