import { Router } from "express";
import {
  getAllApplications,
  getApplicationById,
  updateApplicationStatus,
  updateApplicationScorecard,
} from "../controllers/adminApplicationController";
import { protect, authorize } from "../middleware/auth";

const router = Router();

router.use(protect);
router.use(authorize("admin", "recruiter"));

router.get("/", getAllApplications);
router.get("/:id", getApplicationById);
router.patch("/:id/status", updateApplicationStatus);
router.patch("/:id/scorecard", updateApplicationScorecard);

export default router;
