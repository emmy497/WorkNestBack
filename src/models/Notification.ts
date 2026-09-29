import { Schema, model, Types } from "mongoose";

// Three kinds of notification, from two different sources:
//
// - "application_status" is created directly, the moment a recruiter moves
//   an application to a new stage (see adminApplicationController).
// - "job_closing_soon" and "job_match" have no real-time trigger to hang off
//   of (there's no cron job, and no "job just got created" event worth
//   watching) — they're generated lazily, the moment a candidate asks for
//   their notifications. See notificationController.getNotifications.
export type NotificationType = "application_status" | "job_closing_soon" | "job_match";

export interface INotification {
  user: Types.ObjectId;
  type: NotificationType;

  // Rendered to plain text once, when the notification is created — a read
  // never needs to populate or re-derive copy from the job/application.
  title: string;
  body: string;

  isRead: boolean;

  // Only set on "application_status" notifications — which real status this
  // was about, so the frontend can pick an icon without having to parse it
  // back out of the title text.
  status?: string;

  // Optional links back to what this notification is about, so the
  // frontend can navigate somewhere when it's clicked.
  job?: Types.ObjectId;
  application?: Types.ObjectId;

  // Only set by the two LAZILY-generated types, as `${type}:${jobId}` — see
  // the unique index below. "application_status" notifications never set
  // this, since each real status change should always create its own row.
  dedupeKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["application_status", "job_closing_soon", "job_match"],
      required: true,
    },

    title: { type: String, required: true },
    body: { type: String, required: true },

    isRead: { type: Boolean, default: false },

    status: { type: String },

    job: { type: Schema.Types.ObjectId, ref: "Job" },
    application: { type: Schema.Types.ObjectId, ref: "Application" },

    dedupeKey: { type: String },
  },
  { timestamps: true }
);

// Sparse: only documents that actually SET dedupeKey are checked for
// uniqueness, so the many application_status rows (which never set it)
// never collide with each other here.
notificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true, sparse: true });

export const Notification = model<INotification>("Notification", notificationSchema);
