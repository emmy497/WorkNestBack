import { Request, Response } from "express";
import { Types } from "mongoose";

import { Application, ApplicationStatus } from "../models/Application";
import { Job } from "../models/Job";
import { User } from "../models/User";

import { Company } from "../models/Company";
void Company;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function percentChange(now: number, before: number): number {
  if (before === 0) return now > 0 ? 100 : 0;
  return Math.round(((now - before) / before) * 100);
}

const STATUS_LABELS: Array<{ status: ApplicationStatus; label: string }> = [
  { status: "submitted", label: "Submitted" },
  { status: "review", label: "Reviewing" },
  { status: "shortlisted", label: "Shortlisted" },
  { status: "interview", label: "Interview" },
  { status: "offer", label: "Offer" },
  { status: "hired", label: "Hired" },
  { status: "rejected", label: "Not selected" },
];

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

export async function getOverview(_req: Request, res: Response) {
  try {
    const now = new Date();
    const weekAgo = daysAgo(7);
    const monthAgo = daysAgo(30);
    const twoMonthsAgo = daysAgo(60);

    const [
      activeJobs,
      totalCandidates,
      totalClients,
      totalApplications,

      jobsOpenedThisWeek,
      candidatesThisMonth,
      applicationsThisMonth,
      applicationsPreviousMonth,

      statusRows,

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

      Application.aggregate<{ _id: ApplicationStatus; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      Application.aggregate<{ _id: ApplicationStatus; count: number }>([
        { $unwind: "$statusHistory" },
        { $group: { _id: "$statusHistory.status", count: { $sum: 1 } } },
      ]),
    ]);

    const currentCount = (status: ApplicationStatus) =>
      statusRows.find((row) => row._id === status)?.count ?? 0;

    const reachedCount = (status: ApplicationStatus) =>
      pipelineRows.find((row) => row._id === status)?.count ?? 0;

    const [
      shortlistedThisWeek,
      interviewsThisWeek,
      hiredThisMonth,
      recentApplications,
      closingJobs,
      mostAppliedRoles,
    ] = await Promise.all([
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

      Job.find({ status: "open", closesAt: { $gte: now } })
        .select("title location workArrangement closesAt company")
        .populate({ path: "company", select: "name" })
        .sort({ closesAt: 1 })
        .limit(3)
        .lean<PopulatedClosingJob[]>(),

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

    const applicantCounts = await Application.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: { job: { $in: closingJobs.map((job) => job._id) } } },
      { $group: { _id: "$job", count: { $sum: 1 } } },
    ]);

    res.json({
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

      counts: {
        jobs: activeJobs,
        clients: totalClients,
        candidates: totalCandidates,
      },

      applicationsByStatus: STATUS_LABELS.map(({ status, label }) => ({
        status,
        label,
        count: currentCount(status),
      })),

      pipeline: STATUS_LABELS.filter(
        (entry) => entry.status !== "rejected"
      ).map(({ status, label }) => ({
        status,
        label,
        count: reachedCount(status),
      })),

      recentApplications: recentApplications
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
