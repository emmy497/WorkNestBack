import { Schema, model } from "mongoose";

// STEP 1 — Describe the data in TypeScript.
// This is just a shape. It has no connection to MongoDB yet.
export interface ICompany {
  name: string;
  slug: string; // URL-friendly name, e.g. "paystack"
  logoUrl?: string; // the "?" means this field is optional
  website?: string;
  about?: string;
  industry?: string;
  location?: string;
  createdAt: Date;
  updatedAt: Date;
}

// STEP 2 — Describe the same data to Mongoose, so it can validate it.
// The <ICompany> part links the two together: if they disagree, TypeScript complains.
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
  // `timestamps: true` makes Mongoose add createdAt and updatedAt automatically
  { timestamps: true }
);

// STEP 3 — Turn the schema into a model. The model is what we actually use
// to query: Company.find(), Company.create(), and so on.
//
// "Company" becomes the collection name "companies" in MongoDB (lowercase + plural).
export const Company = model<ICompany>("Company", companySchema);
