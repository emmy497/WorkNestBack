import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGO_URI is missing. Check your server/.env file.");
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");
}
