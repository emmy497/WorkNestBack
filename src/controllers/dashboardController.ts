import { Request, Response } from "express";
import { Types } from "mongoose";

import { Application, ApplicationStatus } from "../models/Application";
import { Job } from "../models/Job";
import { User } from "../models/User";

// Needed so .populate() can find these models — see the note in jobController
// about type-only imports being stripped at compile time.
import { Company } from "../models/Company";
void Company;

// ---------------------------------------------------------------------------
// Small time helpers.
//
// Every "vs last week" figure on the dashboard is really just "how many rows
// have a date newer than X", so it all comes back to these two lines.
// ---------------------------------------------------------------------------
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// Turns a before/after pair into the percentage change between them.
// Guarded, because dividing by zero gives Infinity, not a number.
function percentChange(now: number, before: number): number {
  if (before === 0) return now > 0 ? 100 : 0;
  return Math.round(((now - before) / before) * 100);
}

// The statuses we show, in pipeline order, with the wording the design uses.
// "review" is stored short but reads better as "Reviewing".
const STATUS_LABELS: Array<{ status: ApplicationStatus; label: string }> = [
  { status: "submitted", label: "Submitted" },
  { status: "review", label: "Reviewing" },
  { status: "shortlisted", label: "Shortlisted" },
  { status: "interview", label: "Interview" },
  { status: "offer", label: "Offer" },
  { status: "hired", label: "Hired" },
  { status: "rejected", label: "Not selected" },
];

// After .populate(), these fields hold whole documents instead of ids.
// These types describe the shapes we actually read below.
type PopulatedRecentApplication = {
  _id: Types.ObjectId;
  fullName: string;
  status: ApplicationStatus;
  createdAt: Date;
  job: { _id: Types.ObjectId; title: string; company: { name: string } } | null;
  applicant: { headline?: string } | null;
};

type PopulatedClosingJob = {
  _id: Types.ObjectId;
  title: string;
  location: string;
  workArrangement: string;
  closesAt: Date;
  company: { name: string } | null;
};

// ---------------------------------------------------------------------------
// GET /api/dashboard/overview
//
// Everything the Overview screen needs, in ONE request.
//
// Why one request instead of eight small ones? The page shows all of these
// panels at the same time, so eight requests would mean eight loading
// spinners finishing at eight different moments. One request means the page
// either has its data or doesn't.
// ---------------------------------------------------------------------------
export async function getOverview(_req: Request, res: Response) {
  try {
    const now = new Date();
    const weekAgo = daysAgo(7);
    const monthAgo = daysAgo(30);
    const twoMonthsAgo = daysAgo(60);

    // Promise.all runs these together rather than one after another. Each
    // query is independent, so waiting for one before starting the next
    // would just make the page slower for no reason.
    const [
      activeJobs,
      totalCandidates,
      totalClients,
      totalApplications,

      // The "vs last week" / "this month" figures
      jobsOpenedThisWeek,
      candidatesThisMonth,
      applicationsThisMonth,
      applicationsPreviousMonth,

      // Current status of every application, grouped
      statusRows,

      // How many applications have EVER passed through each stage
      pipelineRows,
    ] = await Promise.all([
      Job.countDocuments({ status: "open" }),
      User.countDocuments({ role: "candidate" }),
      Company.countDocuments(),
      Application.countDocuments(),

      Job.countDocuments({ status: "open", createdAt: { $gte: weekAgo } }),
      User.countDocuments({ role: "candidate", createdAt: { $gte: monthAgo } }),
      Application.countDocuments({ createdAt: { $gte: monthAgo } }),
      Application.countDocuments({
        createdAt: { $gte: twoMonthsAgo, $lt: monthAgo },
      }),

      // $group is the database's version of "sort these into piles and tell
      // me how big each pile is". _id is what we group BY.
      Application.aggregate<{ _id: ApplicationStatus; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      // statusHistory is an array of every status an application has held.
      // Grouping on it counts applications that REACHED a stage, even if
      // they've since moved past it — which is what a pipeline means.
      Application.aggregate<{ _id: ApplicationStatus; count: number }>([
        { $unwind: "$statusHistory" },
        { $group: { _id: "$statusHistory.status", count: { $sum: 1 } } },
      ]),
    ]);

    // Aggregate results come back as an unordered array, so a small lookup
    // helper is easier to read than repeating .find() six times.
    const currentCount = (status: ApplicationStatus) =>
      statusRows.find((row) => row._id === status)?.count ?? 0;

    const reachedCount = (status: ApplicationStatus) =>
      pipelineRows.find((row) => row._id === status)?.count ?? 0;

    // These three need the counts above, so they run in a second batch.
    const [
      shortlistedThisWeek,
      interviewsThisWeek,
      hiredThisMonth,
      recentApplications,
      closingJobs,
      mostAppliedRoles,
    ] = await Promise.all([
      // updatedAt, not createdAt: we want applications that MOVED into this
      // status recently, not ones that were created recently.
      Application.countDocuments({
        status: "shortlisted",
        updatedAt: { $gte: weekAgo },
      }),
      Application.countDocuments({
        status: "interview",
        updatedAt: { $gte: weekAgo },
      }),
      Application.countDocuments({
        status: "hired",
        updatedAt: { $gte: monthAgo },
      }),

      // The five newest applications, with the job, its company, and the
      // candidate's headline all pulled in.
      Application.find()
        .select("fullName status createdAt job applicant")
        .populate({
          path: "job",
          select: "title company",
          populate: { path: "company", select: "name" },
        })
        .populate({ path: "applicant", select: "headline" })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean<PopulatedRecentApplication[]>(),

      // Open roles with the nearest deadline. $gte now excludes any that
      // have already closed but haven't been marked closed yet.
      Job.find({ status: "open", closesAt: { $gte: now } })
        .select("title location workArrangement closesAt company")
        .populate({ path: "company", select: "name" })
        .sort({ closesAt: 1 })
        .limit(3)
        .lean<PopulatedClosingJob[]>(),

      // The four roles with the most applications.
      //
      // $lookup is a join: it takes the job id we grouped by and pulls in the
      // matching job document, then does the same again for its company.
      Application.aggregate<{
        id: string;
        title: string;
        companyName: string;
        count: number;
      }>([
        { $group: { _id: "$job", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 4 },
        {
          $lookup: {
            from: "jobs",
            localField: "_id",
            foreignField: "_id",
            as: "job",
          },
        },
        { $unwind: "$job" },
        {
          $lookup: {
            from: "companies",
            localField: "job.company",
            foreignField: "_id",
            as: "company",
          },
        },
        { $unwind: "$company" },
        {
          $project: {
            _id: 0,
            id: { $toString: "$_id" },
            title: "$job.title",
            companyName: "$company.name",
            count: 1,
          },
        },
      ]),
    ]);

    // How many applications each of the closing-soon roles has attracted.
    const applicantCounts = await Application.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: { job: { $in: closingJobs.map((job) => job._id) } } },
      { $group: { _id: "$job", count: { $sum: 1 } } },
    ]);

    res.json({
      // The six cards along the top. Each one is a number plus a short line
      // of context, because "24" on its own doesn't tell you if that's good.
      stats: {
        activeJobs: {
          value: activeJobs,
          change: jobsOpenedThisWeek,
          changeLabel: "vs last week",
        },
        registeredCandidates: {
          value: totalCandidates,
          change: candidatesThisMonth,
          changeLabel: "this month",
        },
        applicationsReceived: {
          value: totalApplications,
          change: percentChange(
            applicationsThisMonth,
            applicationsPreviousMonth
          ),
          changeLabel: "this month",
          changeIsPercent: true,
        },
        shortlisted: {
          value: currentCount("shortlisted"),
          change: shortlistedThisWeek,
          changeLabel: "this week",
        },
        interviewsScheduled: {
          value: currentCount("interview"),
          change: interviewsThisWeek,
          changeLabel: "this week",
        },
        placementsMade: {
          value: currentCount("hired"),
          change: hiredThisMonth,
          changeLabel: "this month",
        },
      },

      // Sidebar badge counts
      counts: {
        jobs: activeJobs,
        clients: totalClients,
        candidates: totalCandidates,
      },

      // Where every application sits RIGHT NOW. These add up to the total,
      // because an application has exactly one current status.
      applicationsByStatus: STATUS_LABELS.map(({ status, label }) => ({
        status,
        label,
        count: currentCount(status),
      })),

      // How far applications have got. These do NOT add up to the total —
      // one application that reached "interview" is counted in submitted,
      // review, shortlisted AND interview, because it passed through them.
      pipeline: STATUS_LABELS.filter(
        (entry) => entry.status !== "rejected"
      ).map(({ status, label }) => ({
        status,
        label,
        count: reachedCount(status),
      })),

      recentApplications: recentApplications
        // Skip any whose job has since been deleted, rather than sending
        // nulls the frontend would have to guard against.
        .filter((app) => app.job !== null)
        .map((app) => ({
          id: String(app._id),
          candidateName: app.fullName,
          candidateHeadline: app.applicant?.headline ?? "",
          jobId: String(app.job!._id),
          jobTitle: app.job!.title,
          companyName: app.job!.company?.name ?? "",
          status: app.status,
          appliedAt: new Date(app.createdAt).toISOString(),
        })),

      jobsClosingSoon: closingJobs.map((job) => ({
        id: String(job._id),
        title: job.title,
        companyName: job.company?.name ?? "",
        location: job.location,
        workArrangement: job.workArrangement,
        closesAt: new Date(job.closesAt).toISOString(),
        applicantCount:
          applicantCounts.find(
            (row) => String(row._id) === String(job._id)
          )?.count ?? 0,
      })),

      mostAppliedRoles,
    });
  } catch (error) {
    console.error("getOverview failed:", error);
    res.status(500).json({ message: "Could not load the dashboard" });
  }
}
