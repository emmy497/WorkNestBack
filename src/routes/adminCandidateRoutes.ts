import { Router } from "express";
import { getCandidates } from "../controllers/adminCandidateController";
import { protect, authorize } from "../middleware/auth";

const router = Router();

router.get("/", protect, authorize("admin", "recruiter"), getCandidates); // GET /api/admin/candidates

export default router;
