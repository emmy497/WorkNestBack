import { Schema, model, Types } from "mongoose";

// A saved job is just a pairing: "this user bookmarked that job".
// There's no extra information to store, which is why this model is so small.
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
      index: true, // we always look these up by user
    },
    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
  },
  // timestamps gives us createdAt for free, so we can show newest-saved first
  { timestamps: true }
);

// A COMPOUND unique index: the combination of user + job must be unique.
//
// One user can save many jobs, and one job can be saved by many users — but
// the same person cannot save the same job twice. Enforcing this in the
// database means a double-tapped bookmark button can't create two rows.
savedJobSchema.index({ user: 1, job: 1 }, { unique: true });

export const SavedJob = model<ISavedJob>("SavedJob", savedJobSchema);
