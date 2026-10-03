import { Router } from "express";
import { getAdminJobs, createJob } from "../controllers/adminJobController";
import { protect, authorize } from "../middleware/auth";

const router = Router();

// Logged in AND an admin or recruiter — same guard as adminApplicationRoutes.
router.get("/", protect, authorize("admin", "recruiter"), getAdminJobs); //  GET  /api/admin/jobs
router.post("/", protect, authorize("admin", "recruiter"), createJob); //    POST /api/admin/jobs

export default router;
