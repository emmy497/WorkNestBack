import { Router } from "express";
import { getJobs, getJobById } from "../controllers/jobController";

// A Router is a mini version of the Express app. We define our job-related
// URLs here, then plug the whole thing into the main app in server.ts.
const router = Router();

// The paths here are RELATIVE. In server.ts we mount this router at "/api/jobs",
// so "/" below actually means "/api/jobs".
router.get("/", getJobs); //          GET /api/jobs
router.get("/:id", getJobById); //    GET /api/jobs/652f8a...

export default router;
