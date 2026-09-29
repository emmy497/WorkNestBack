import { Request, Response } from "express";
import { Types } from "mongoose";

import { Notification } from "../models/Notification";
import { SavedJob } from "../models/SavedJob";
import { Job, IJob } from "../models/Job";
import { User } from "../models/User";

// Needed so .populate() can find this model — see the same note in
// jobController about type-only imports being stripped at compile time.
import { Company } from "../models/Company";
void Company;

type PopulatedJob = IJob & {
  _id: Types.ObjectId;
  company: { _id: Types.ObjectId; name: string } | null;
};

const CLOSING_SOON_WINDOW_DAYS = 3;
const JOB_MATCH_LOOKBACK_DAYS = 14;
const JOB_MATCH_LIMIT = 5;

// ---------------------------------------------------------------------------
// There's no cron job in this app, so "closing soon" and "job match"
// notifications don't get created the moment they become true — they get
// created (once each, thanks to the dedupeKey unique index) the next time
// this candidate asks for their notifications at all.
// ---------------------------------------------------------------------------
async function generateClosingSoonNotifications(userId: string) {
  const now = Date.now();
  const windowEnd = new Date(now + CLOSING_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const saved = await SavedJob.find({ user: userId })
    .populate({ path: "job", populate: { path: "company", select: "name" } })
    .lean();

  for (const entry of saved) {
    const job = entry.job as unknown as PopulatedJob | null;

    if (!job || job.status !== "open") continue;
    if (job.closesAt > windowEnd || job.closesAt < new Date(now)) continue;

    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(job.closesAt).getTime() - now) / (24 * 60 * 60 * 1000))
    );

    await Notification.updateOne(
      { user: userId, dedupeKey: `job_closing_soon:${job._id}` },
      {
        $setOnInsert: {
          user: userId,
          type: "job_closing_soon",
          title: "A saved role is closing soon",
          body: `${job.title} at ${job.company?.name ?? "this company"} closes in ${daysLeft} ${
            daysLeft === 1 ? "day" : "days"
          }.`,
          job: job._id,
          dedupeKey: `job_closing_soon:${job._id}`,
        },
      },
      { upsert: true }
    );
  }
}

async function generateJobMatchNotifications(userId: string) {
  const user = await User.findById(userId).select("skills").lean();

  if (!user || !user.skills || user.skills.length === 0) return;

  const lookback = new Date(Date.now() - JOB_MATCH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const jobs = await Job.find({
    status: "open",
    createdAt: { $gte: lookback },
    skills: { $in: user.skills },
  })
    .populate({ path: "company", select: "name" })
    .sort({ createdAt: -1 })
    .limit(JOB_MATCH_LIMIT)
    .lean<PopulatedJob[]>();

  for (const job of jobs) {
    await Notification.updateOne(
      { user: userId, dedupeKey: `job_match:${job._id}` },
      {
        $setOnInsert: {
          user: userId,
          type: "job_match",
          title: "A new role matches your skills",
          body: `${job.title} at ${job.company?.name ?? "this company"} just opened — worth a look.`,
          job: job._id,
          dedupeKey: `job_match:${job._id}`,
        },
      },
      { upsert: true }
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/notifications
// ---------------------------------------------------------------------------
export async function getNotifications(req: Request, res: Response) {
  try {
    const userId = req.userId as string;

    // Best-effort — a hiccup generating lazy notifications shouldn't stop
    // the candidate from seeing the ones that already exist.
    await Promise.all([
      generateClosingSoonNotifications(userId).catch((error) =>
        console.error("generateClosingSoonNotifications failed:", error)
      ),
      generateJobMatchNotifications(userId).catch((error) =>
        console.error("generateJobMatchNotifications failed:", error)
      ),
    ]);

    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({
      notifications: notifications.map((n) => ({
        id: String(n._id),
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        status: n.status ?? null,
        jobId: n.job ? String(n.job) : null,
        createdAt: new Date(n.createdAt).toISOString(),
      })),
      unreadCount,
    });
  } catch (error) {
    console.error("getNotifications failed:", error);
    res.status(500).json({ message: "Could not load your notifications" });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/notifications/:id/read
// ---------------------------------------------------------------------------
export async function markNotificationRead(req: Request, res: Response) {
  try {
    const id = String(req.params.id);

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "That notification id is not valid" });
    }

    // Matching on BOTH id and user means nobody can mark someone else's
    // notification as read by guessing an id.
    await Notification.updateOne(
      { _id: id, user: req.userId },
      { $set: { isRead: true } }
    );

    res.json({ id, isRead: true });
  } catch (error) {
    console.error("markNotificationRead failed:", error);
    res.status(500).json({ message: "Could not update that notification" });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/notifications/read-all
// ---------------------------------------------------------------------------
export async function markAllNotificationsRead(req: Request, res: Response) {
  try {
    await Notification.updateMany(
      { user: req.userId, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("markAllNotificationsRead failed:", error);
    res.status(500).json({ message: "Could not update your notifications" });
  }
}
