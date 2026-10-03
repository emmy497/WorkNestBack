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
import dashboardRoutes from "./routes/dashboardRoutes";
import notificationRoutes from "./routes/notificationRoutes";

// Environment variables are loaded via `import 'dotenv/config'` above.

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware -------------------------------------------------------------
// Middleware are functions that run on every request, before your routes.

// Allow requests from any origin. Fine for a public read API with no
// cookie-based auth — if you ever add cookies/sessions, this needs to
// go back to an explicit origin list instead (wildcard + credentials
// isn't allowed by browsers).
app.use(cors({ origin: "*" }));

// Lets us read JSON bodies sent by the frontend, via req.body.
// Without this, req.body is undefined on POST requests.
app.use(express.json());

// --- Routes -----------------------------------------------------------------

// A simple health check. Visiting http://localhost:5000/api/health
// tells you the server is alive, without touching the database.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Everything in jobRoutes now lives under /api/jobs
app.use("/api/jobs", jobRoutes);

// Everything in authRoutes lives under /api/auth
app.use("/api/auth", authRoutes);

// Everything in profileRoutes lives under /api/profile
app.use("/api/profile", profileRoutes);

// Saved jobs — all of these require a logged-in user
app.use("/api/saved-jobs", savedJobRoutes);

// Applications — also all logged-in only
app.use("/api/applications", applicationRoutes);

// Reviewing applications (any candidate's) — logged in AND an admin or
// recruiter. Kept as its own base path rather than nested under
// /api/applications so it can never collide with the candidate-facing
// "/:jobId" and "/job/:jobId" routes above.
app.use("/api/admin/applications", adminApplicationRoutes);

// Managing jobs as an admin/recruiter — every status, not just "open".
app.use("/api/admin/jobs", adminJobRoutes);

// The Client dropdown on the New Role form.
app.use("/api/admin/companies", adminCompanyRoutes);

// The admin dashboard — logged in AND an admin or recruiter
app.use("/api/dashboard", dashboardRoutes);

// Notifications — also all logged-in only
app.use("/api/notifications", notificationRoutes);

// --- Start ------------------------------------------------------------------
// We connect to the database FIRST, and only start listening if that worked.
// Otherwise the server would accept requests it can't possibly answer.
async function start() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1); // stop the process — something is badly wrong
  }
}

start();
