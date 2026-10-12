import { Request, Response } from "express";
import { Types } from "mongoose";
import { User } from "../models/User";
import { Application } from "../models/Application";

type CandidateStatus = "open" | "placed" | "employed";

// Profiles store a range ("3-5 years"); the admin table groups those into
// the same three levels jobs use.
function experienceLevel(yearsOfExperience?: string): string {
  if (!yearsOfExperience) return "";
  if (yearsOfExperience.startsWith("0-1") || yearsOfExperience.startsWith("1-3")) return "Junior";
  if (yearsOfExperience.startsWith("3-5")) return "Mid-level";
  return "Senior";
}

// ---------------------------------------------------------------------------
// GET /api/admin/candidates
//
// Every registered candidate plus two computed fields. "Placed" wins over
// everything — if WorkNest hired them, that's what the admin wants to see.
// Otherwise the candidate's own openToWork flag decides.
// ---------------------------------------------------------------------------
export async function getCandidates(_req: Request, res: Response) {
  try {
    const [users, applicationsAgg] = await Promise.all([
      User.find({ role: "candidate" })
        .select("name email headline location yearsOfExperience skills availability openToWork createdAt")
        .lean(),
      // Sorted newest first so $first picks up what the candidate typed on
      // their most recent application.
      Application.aggregate<{
        _id: Types.ObjectId;
        total: number;
        hired: number;
        location: string;
        yearsOfExperience: string;
        availability: string;
      }>([
        { $match: { applicant: { $ne: null } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$applicant",
            total: { $sum: 1 },
            hired: { $sum: { $cond: [{ $eq: ["$status", "hired"] }, 1, 0] } },
            location: { $first: "$location" },
            yearsOfExperience: { $first: "$yearsOfExperience" },
            availability: { $first: "$availability" },
          },
        },
      ]),
    ]);

    const statsByUser = new Map(applicationsAgg.map((row) => [String(row._id), row]));

    const candidates = users.map((user) => {
      const stats = statsByUser.get(String(user._id));
      const status: CandidateStatus = stats?.hired
        ? "placed"
        : user.openToWork === false
          ? "employed"
          : "open";

      // Most candidates apply before ever filling in their profile, so fall
      // back to what they entered on their latest application.
      const location = user.location || stats?.location || "";
      const yearsOfExperience = user.yearsOfExperience || stats?.yearsOfExperience || "";
      const availability = user.availability || stats?.availability || "";

      return {
        id: String(user._id),
        name: user.name,
        email: user.email,
        headline: user.headline ?? "",
        location,
        yearsOfExperience,
        experienceLevel: experienceLevel(yearsOfExperience),
        skills: user.skills ?? [],
        availability,
        applications: stats?.total ?? 0,
        status,
        joinedAt: user.createdAt,
      };
    });

    candidates.sort((a, b) => b.applications - a.applications || a.name.localeCompare(b.name));

    res.json(candidates);
  } catch (error) {
    console.error("getCandidates failed:", error);
    res.status(500).json({ message: "Could not load candidates" });
  }
}
