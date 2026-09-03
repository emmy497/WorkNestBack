import { Request, Response } from "express";
import { User } from "../models/User";
import { uploadBufferToCloudinary } from "../config/cloudinary";

// A small helper so we never accidentally send the password or OTP fields
// back — same idea as toSafeUser in authController, just with every profile
// field included too.
function toProfileResponse(user: {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  isVerified: boolean;
  headline?: string;
  location?: string;
  phone?: string;
  yearsOfExperience?: string;
  skills: string[];
  cvUrl?: string;
  cvOriginalName?: string;
  portfolioLink?: string;
  linkedin?: string;
  preferredJobTypes: string[];
  preferredWorkArrangements: string[];
  expectedSalaryMin?: number;
  expectedSalaryMax?: number;
  availability?: string;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    isVerified: user.isVerified,
    headline: user.headline || "",
    location: user.location || "",
    phone: user.phone || "",
    yearsOfExperience: user.yearsOfExperience || "",
    skills: user.skills || [],
    cvUrl: user.cvUrl || "",
    cvOriginalName: user.cvOriginalName || "",
    portfolioLink: user.portfolioLink || "",
    linkedin: user.linkedin || "",
    preferredJobTypes: user.preferredJobTypes || [],
    preferredWorkArrangements: user.preferredWorkArrangements || [],
    expectedSalaryMin: user.expectedSalaryMin ?? null,
    expectedSalaryMax: user.expectedSalaryMax ?? null,
    availability: user.availability || "",
  };
}

// ===========================================================================
// GET /api/profile/me
//
// Runs after `protect`, which is what sets req.userId.
// ===========================================================================
export async function getMyProfile(req: Request, res: Response) {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ profile: toProfileResponse(user) });
  } catch (error) {
    console.error("getMyProfile failed:", error);
    res.status(500).json({ message: "Could not load your profile" });
  }
}

// Fields the candidate is allowed to set themselves. Deliberately a
// whitelist — role, email, isVerified etc. can NEVER be changed through
// this endpoint, no matter what the request body contains.
const EDITABLE_FIELDS = [
  "name",
  "headline",
  "location",
  "phone",
  "yearsOfExperience",
  "skills",
  "portfolioLink",
  "linkedin",
  "preferredJobTypes",
  "preferredWorkArrangements",
  "expectedSalaryMin",
  "expectedSalaryMax",
  "availability",
] as const;

// ===========================================================================
// PATCH /api/profile/me   { ...any of EDITABLE_FIELDS }
//
// Partial update — only the fields present in the body are touched. This
// is what lets the frontend save section-by-section instead of forcing one
// giant "save everything at once" button.
// ===========================================================================
export async function updateMyProfile(req: Request, res: Response) {
  try {
    const updates: Record<string, unknown> = {};

    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (typeof updates.skills !== "undefined" && !Array.isArray(updates.skills)) {
      return res.status(400).json({ message: "skills must be an array of strings" });
    }
    if (
      typeof updates.preferredJobTypes !== "undefined" &&
      !Array.isArray(updates.preferredJobTypes)
    ) {
      return res
        .status(400)
        .json({ message: "preferredJobTypes must be an array of strings" });
    }
    if (
      typeof updates.preferredWorkArrangements !== "undefined" &&
      !Array.isArray(updates.preferredWorkArrangements)
    ) {
      return res
        .status(400)
        .json({ message: "preferredWorkArrangements must be an array of strings" });
    }

    const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, {
      new: true, // return the document AFTER the update, not before
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ profile: toProfileResponse(user) });
  } catch (error) {
    console.error("updateMyProfile failed:", error);
    res.status(500).json({ message: "Could not save your profile" });
  }
}

// ===========================================================================
// POST /api/profile/me/cv   (multipart/form-data, field name "cv")
//
// `uploadCvFile.single("cv")` middleware runs first and puts the file on
// req.file — see middleware/upload.ts.
// ===========================================================================
export async function uploadCv(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file was uploaded" });
    }

    const { secureUrl } = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "worknest/cvs",
      filename: `${req.userId}-${Date.now()}`,
    });

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { cvUrl: secureUrl, cvOriginalName: req.file.originalname } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ profile: toProfileResponse(user) });
  } catch (error) {
    console.error("uploadCv failed:", error);
    res.status(500).json({ message: "Could not upload your CV" });
  }
}
