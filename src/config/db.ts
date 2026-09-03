import mongoose from "mongoose";

// This function opens the connection to MongoDB Atlas.
// We call it once, when the server starts up.
export async function connectDB(): Promise<void> {
  const uri = process.env.MONGO_URI;

  // Fail loudly and early if the .env file is missing the connection string,
  // instead of getting a confusing error later.
  if (!uri) {
    throw new Error("MONGO_URI is missing. Check your server/.env file.");
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");
}
