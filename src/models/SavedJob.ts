import { Schema, model, Types } from "mongoose";

export interface ISavedJob {
  user: Types.ObjectId;
  job: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const savedJobSchema = new Schema<ISavedJob>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
  },
  { timestamps: true }
);

savedJobSchema.index({ user: 1, job: 1 }, { unique: true });

export const SavedJob = model<ISavedJob>("SavedJob", savedJobSchema);
