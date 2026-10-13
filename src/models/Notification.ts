import { Schema, model, Types } from "mongoose";

export type NotificationType = "application_status" | "job_closing_soon" | "job_match";

export interface INotification {
  user: Types.ObjectId;
  type: NotificationType;

  title: string;
  body: string;

  isRead: boolean;

  status?: string;

  job?: Types.ObjectId;
  application?: Types.ObjectId;

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

notificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true, sparse: true });

export const Notification = model<INotification>("Notification", notificationSchema);
