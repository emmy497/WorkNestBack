import { Request, Response } from "express";
import { Types } from "mongoose";
import { Company } from "../models/Company";
import { Job } from "../models/Job";
import { Application } from "../models/Application";
import { uploadBufferToCloudinary } from "../config/cloudinary";

// ---------------------------------------------------------------------------
// GET /api/admin/companies
//
// Just a name + id list, for the "Client" dropdown on the New Role form.
// ---------------------------------------------------------------------------
export async function getCompanies(_req: Request, res: Response) {
  try {
    const companies = await Company.find()
      .select("name")
      .sort({ name: 1 })
      .lean();

    res.json(companies.map((company) => ({ id: String(company._id), name: company.name })));
  } catch (error) {
    console.error("getCompanies failed:", error);
    res.status(500).json({ message: "Could not load clients" });
  }
}

// Turns "Moniepoint" into "moniepoint" — same idea adminJobController.ts
// uses for job slugs, disambiguated the same way on collision.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;

  while (
    await Company.exists({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toClientShape(
  company: {
    _id: Types.ObjectId;
    name: string;
    industry?: string;
    about?: string;
    location?: string;
    logoUrl?: string;
    website?: string;
  },
  openRoles: number,
  placements: number
) {
  return {
    id: String(company._id),
    name: company.name,
    industry: company.industry ?? "",
    description: company.about ?? "",
    location: company.location ?? "",
    logoUrl: company.logoUrl ?? "",
    website: company.website ?? "",
    openRoles,
    placements,
  };
}

// ---------------------------------------------------------------------------
// GET /api/admin/companies/clients
//
// The full Clients page — every company plus two computed stats. Neither
// stat is stored: "open roles" comes from Job, "placements" from Application,
// both aggregated in one query each rather than per-company lookups.
// ---------------------------------------------------------------------------
export async function getClients(_req: Request, res: Response) {
  try {
    const companies = await Company.find().sort({ name: 1 }).lean();

    const [openRolesAgg, placementsAgg] = await Promise.all([
      Job.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { status: "open" } },
        { $group: { _id: "$company", count: { $sum: 1 } } },
      ]),
      Application.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { status: "hired" } },
        { $lookup: { from: "jobs", localField: "job", foreignField: "_id", as: "jobDoc" } },
        { $unwind: "$jobDoc" },
        { $group: { _id: "$jobDoc.company", count: { $sum: 1 } } },
      ]),
    ]);

    const openRolesFor = (id: Types.ObjectId) =>
      openRolesAgg.find((row) => String(row._id) === String(id))?.count ?? 0;
    const placementsFor = (id: Types.ObjectId) =>
      placementsAgg.find((row) => String(row._id) === String(id))?.count ?? 0;

    res.json(companies.map((c) => toClientShape(c, openRolesFor(c._id), placementsFor(c._id))));
  } catch (error) {
    console.error("getClients failed:", error);
    res.status(500).json({ message: "Could not load clients" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/companies/clients/:id
//
// The Client detail page — the company itself plus every one of its jobs,
// each with its own applicant count, and the three summary stats
// (openRoles/totalApplicants/placements) computed across all of them.
// ---------------------------------------------------------------------------
export async function getClientDetail(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "That client is not valid" });
    }

    const company = await Company.findById(id).lean();
    if (!company) {
      return res.status(404).json({ message: "That client could not be found" });
    }

    const jobs = await Job.find({ company: id }).sort({ createdAt: -1 }).lean();
    const jobIds = jobs.map((job) => job._id);

    const [applicantCounts, placementsResult] = await Promise.all([
      Application.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { job: { $in: jobIds } } },
        { $group: { _id: "$job", count: { $sum: 1 } } },
      ]),
      Application.aggregate<{ count: number }>([
        { $match: { status: "hired", job: { $in: jobIds } } },
        { $count: "count" },
      ]),
    ]);

    const countFor = (jobId: Types.ObjectId) =>
      applicantCounts.find((row) => String(row._id) === String(jobId))?.count ?? 0;

    res.json({
      id: String(company._id),
      name: company.name,
      industry: company.industry ?? "",
      description: company.about ?? "",
      location: company.location ?? "",
      logoUrl: company.logoUrl ?? "",
      website: company.website ?? "",
      openRoles: jobs.filter((job) => job.status === "open").length,
      totalApplicants: applicantCounts.reduce((sum, row) => sum + row.count, 0),
      placements: placementsResult[0]?.count ?? 0,
      jobs: jobs.map((job) => ({
        id: String(job._id),
        title: job.title,
        jobType: job.jobType,
        experienceLevel: job.experienceLevel,
        status: job.status,
        applicantCount: countFor(job._id),
        closesAt: new Date(job.closesAt).toISOString(),
      })),
    });
  } catch (error) {
    console.error("getClientDetail failed:", error);
    res.status(500).json({ message: "Could not load this client" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/companies/clients/logo
//
// Standalone, rather than attached to a specific client id — the "New
// client" modal needs somewhere to upload the logo to before the company
// itself exists yet. Returns just the URL; the modal holds onto it and
// sends it along with the rest of the form on submit.
// ---------------------------------------------------------------------------
export async function uploadClientLogo(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No logo file was uploaded" });
    }

    const { secureUrl } = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "worknest/logos",
      filename: `${Date.now()}-${slugify(req.file.originalname.replace(/\.[^.]+$/, ""))}`,
      resourceType: "image",
    });

    res.json({ logoUrl: secureUrl });
  } catch (error) {
    console.error("uploadClientLogo failed:", error);
    res.status(500).json({ message: "Could not upload this logo" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/companies/clients
// ---------------------------------------------------------------------------
export async function createClient(req: Request, res: Response) {
  try {
    const { name, industry, location, description, website, logoUrl } = req.body;

    if (!isNonEmptyString(name)) {
      return res.status(400).json({ message: "Client name is required" });
    }

    const slug = await uniqueSlug(name);

    const company = await Company.create({
      name: name.trim(),
      slug,
      industry: isNonEmptyString(industry) ? industry.trim() : undefined,
      location: isNonEmptyString(location) ? location.trim() : undefined,
      about: isNonEmptyString(description) ? description.trim() : undefined,
      website: isNonEmptyString(website) ? website.trim() : undefined,
      logoUrl: isNonEmptyString(logoUrl) ? logoUrl.trim() : undefined,
    });

    res.status(201).json(toClientShape(company, 0, 0));
  } catch (error) {
    console.error("createClient failed:", error);
    res.status(500).json({ message: "Could not create this client" });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/companies/clients/:id
// ---------------------------------------------------------------------------
export async function updateClient(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "That client is not valid" });
    }

    const { name, industry, location, description, website, logoUrl } = req.body;
    if (!isNonEmptyString(name)) {
      return res.status(400).json({ message: "Client name is required" });
    }

    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ message: "That client could not be found" });
    }

    if (name.trim().toLowerCase() !== company.name.toLowerCase()) {
      company.slug = await uniqueSlug(name, id);
    }
    company.name = name.trim();
    company.industry = isNonEmptyString(industry) ? industry.trim() : undefined;
    company.location = isNonEmptyString(location) ? location.trim() : undefined;
    company.about = isNonEmptyString(description) ? description.trim() : undefined;
    company.website = isNonEmptyString(website) ? website.trim() : undefined;
    company.logoUrl = isNonEmptyString(logoUrl) ? logoUrl.trim() : undefined;
    await company.save();

    const [openRoles, placementsResult] = await Promise.all([
      Job.countDocuments({ company: id, status: "open" }),
      Application.aggregate<{ count: number }>([
        { $match: { status: "hired" } },
        { $lookup: { from: "jobs", localField: "job", foreignField: "_id", as: "jobDoc" } },
        { $unwind: "$jobDoc" },
        { $match: { "jobDoc.company": company._id } },
        { $count: "count" },
      ]),
    ]);

    res.json(toClientShape(company, openRoles, placementsResult[0]?.count ?? 0));
  } catch (error) {
    console.error("updateClient failed:", error);
    res.status(500).json({ message: "Could not update this client" });
  }
}
