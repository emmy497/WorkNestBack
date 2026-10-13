import { Schema, model } from "mongoose";

export interface ICompany {
  name: string;
  slug: string;
  logoUrl?: string;
  website?: string;
  about?: string;
  industry?: string;
  location?: string;
  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    logoUrl: String,
    website: String,
    about: String,
    industry: String,
    location: String,
  },
  { timestamps: true }
);

export const Company = model<ICompany>("Company", companySchema);
