import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db";
import jobRoutes from "./routes/jobRoutes";
import authRoutes from "./routes/authRoutes";
import profileRoutes from "./routes/profileRoutes";
import savedJobRoutes from "./routes/savedJobRoutes";
import applicationRoutes from "./routes/applicationRoutes";
import adminApplicationRoutes from "./routes/adminApplicationRoutes";
import adminJobRoutes from "./routes/adminJobRoutes";
import adminCompanyRoutes from "./routes/adminCompanyRoutes";
import adminCandidateRoutes from "./routes/adminCandidateRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import notificationRoutes from "./routes/notificationRoutes";


const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors({ origin: "*" }));

app.use(express.json());


app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/jobs", jobRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/profile", profileRoutes);

app.use("/api/saved-jobs", savedJobRoutes);

app.use("/api/applications", applicationRoutes);

app.use("/api/admin/applications", adminApplicationRoutes);

app.use("/api/admin/jobs", adminJobRoutes);

app.use("/api/admin/companies", adminCompanyRoutes);

app.use("/api/admin/candidates", adminCandidateRoutes);

app.use("/api/dashboard", dashboardRoutes);

app.use("/api/notifications", notificationRoutes);

async function start() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
