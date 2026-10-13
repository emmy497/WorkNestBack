import { Schema, model, Model } from "mongoose";
import bcrypt from "bcryptjs";

export type UserRole = "candidate" | "recruiter" | "admin";

export type OtpPurpose = "verify-email" | "reset-password";

export interface IUser {
  name: string;
  email: string;
  password?: string;
  googleId?: string;
  role: UserRole;

  isVerified: boolean;

  otpHash?: string;
  otpPurpose?: OtpPurpose;
  otpExpiresAt?: Date;
  otpAttempts: number;

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
  openToWork: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(plainPassword: string): Promise<boolean>;
}

type UserModel = Model<IUser, {}, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: function (this: IUser) {
        return !this.googleId;
      },
      minlength: 6,

      select: false,
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["candidate", "recruiter", "admin"],
      default: "candidate",
    },

    isVerified: { type: Boolean, default: false },

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
    openToWork: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.method(
  "comparePassword",
  function (plainPassword: string): Promise<boolean> {
    if (!this.password) {
      return Promise.resolve(false);
    }

    return bcrypt.compare(plainPassword, this.password);
  }
);

export const User = model<IUser, UserModel>("User", userSchema);
