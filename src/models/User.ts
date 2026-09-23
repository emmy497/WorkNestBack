import { Schema, model, Model } from "mongoose";
import bcrypt from "bcryptjs";

// A user is either someone looking for a job, someone posting jobs,
// or us. This is what "authorization" will be based on later.
export type UserRole = "candidate" | "recruiter" | "admin";

// What a one-time code is FOR. A code sent to reset a password must not
// also work to verify an email, so we record which job it was issued for.
export type OtpPurpose = "verify-email" | "reset-password";

// The shape of a user as stored in the database.
export interface IUser {
  name: string;
  email: string;
  password?: string; // always the HASHED password, never the real one — absent for Google-only accounts
  googleId?: string; // set once they've signed in with Google at least once
  role: UserRole;

  // Set to true once they enter the code we emailed them.
  isVerified: boolean;

  // The one-time code, stored HASHED just like the password.
  otpHash?: string;
  otpPurpose?: OtpPurpose;
  otpExpiresAt?: Date;
  otpAttempts: number; // wrong guesses so far

  // --- Candidate profile — everything a company sees on an application ---
  headline?: string; // e.g. "Product Designer with 4 years' experience"
  location?: string;
  phone?: string;
  yearsOfExperience?: string; // "0-1" | "1-3" | "3-5" | "5-10" | "10+"
  skills: string[];
  cvUrl?: string;
  cvOriginalName?: string;
  portfolioLink?: string;
  linkedin?: string;
  preferredJobTypes: string[]; // "Full-time" | "Contract" | "Internship" | "Part-time"
  preferredWorkArrangements: string[]; // "Remote" | "Hybrid" | "Onsite"
  expectedSalaryMin?: number;
  expectedSalaryMax?: number;
  availability?: string; // e.g. "Immediately" | "2 weeks notice" | "1 month notice"

  createdAt: Date;
  updatedAt: Date;
}

// Extra functions we attach to each user document.
export interface IUserMethods {
  comparePassword(plainPassword: string): Promise<boolean>;
}

// Mongoose needs to know about both the fields and the methods.
type UserModel = Model<IUser, {}, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true, // no two users can share an email
      lowercase: true, // "Emma@X.com" and "emma@x.com" are the same person
      trim: true,
    },

    password: {
      type: String,
      // Only required for accounts that can log in with a password.
      // A Google-only account never sets one.
      required: function (this: IUser) {
        return !this.googleId;
      },
      minlength: 6,

      // select: false means "don't include this field in query results
      // unless I explicitly ask for it". This makes it very hard to
      // accidentally send the password hash back to the browser.
      select: false,
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true, // lets many users have NO googleId without violating uniqueness
      select: false,
    },

    role: {
      type: String,
      enum: ["candidate", "recruiter", "admin"],
      default: "candidate",
    },

    isVerified: { type: Boolean, default: false },

    // All four OTP fields use select: false. They are internal machinery —
    // there is no reason for them to ever appear in an API response.
    otpHash: { type: String, select: false },
    otpPurpose: {
      type: String,
      enum: ["verify-email", "reset-password"],
      select: false,
    },
    otpExpiresAt: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },

    headline: { type: String, trim: true },
    location: { type: String, trim: true },
    phone: { type: String, trim: true },
    yearsOfExperience: { type: String, trim: true },
    skills: { type: [String], default: [] },
    cvUrl: { type: String },
    cvOriginalName: { type: String },
    portfolioLink: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    preferredJobTypes: { type: [String], default: [] },
    preferredWorkArrangements: { type: [String], default: [] },
    expectedSalaryMin: { type: Number },
    expectedSalaryMax: { type: Number },
    availability: { type: String, trim: true },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// This runs automatically just BEFORE a user is saved.
//
// We never store the real password. We store a hash of it — a scrambled
// version that cannot be turned back into the original. So even if someone
// steals the database, they still don't know anyone's password.
// ---------------------------------------------------------------------------
// Because this function is `async`, we don't need a `next` callback —
// Mongoose waits for the promise to finish on its own.
userSchema.pre("save", async function () {
  // Only hash when the password actually changed. Without this check,
  // updating a user's name would re-hash the already-hashed password.
  // Google-only accounts have no password at all, so also skip then.
  if (!this.isModified("password") || !this.password) {
    return;
  }

  // 10 is the "cost" — how much work hashing takes. Higher is safer but
  // slower. 10 is the normal choice.
  this.password = await bcrypt.hash(this.password, 10);
});

// ---------------------------------------------------------------------------
// Checks a login attempt against the stored hash.
//
// We can't un-hash the stored password, so bcrypt hashes the attempt
// the same way and compares the two results.
// ---------------------------------------------------------------------------
userSchema.method(
  "comparePassword",
  function (plainPassword: string): Promise<boolean> {
    // A Google-only account has no password to check against.
    if (!this.password) {
      return Promise.resolve(false);
    }

    return bcrypt.compare(plainPassword, this.password);
  }
);

export const User = model<IUser, UserModel>("User", userSchema);
