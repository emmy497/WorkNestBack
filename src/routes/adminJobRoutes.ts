import { Router } from "express";
import { getAdminJobs, createJob } from "../controllers/adminJobController";
import { protect, authorize } from "../middleware/auth";

const router = Router();

router.get("/", protect, authorize("admin", "recruiter"), getAdminJobs);
router.post("/", protect, authorize("admin", "recruiter"), createJob);

export default router;
