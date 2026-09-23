import { Router } from "express";
import {
  getAllApplications,
  getApplicationById,
  updateApplicationStatus,
  updateApplicationScorecard,
} from "../controllers/adminApplicationController";
import { protect, authorize } from "../middleware/auth";

const router = Router();

// Same two-step guard as dashboardRoutes: protect() checks identity,
// authorize() checks role. A candidate has a valid token but no business
// seeing (or editing) every application in the system.
router.use(protect);
router.use(authorize("admin", "recruiter"));

router.get("/", getAllApplications); //                    GET   /api/admin/applications
router.get("/:id", getApplicationById); //                 GET   /api/admin/applications/:id
router.patch("/:id/status", updateApplicationStatus); //   PATCH /api/admin/applications/:id/status
router.patch("/:id/scorecard", updateApplicationScorecard); // PATCH /api/admin/applications/:id/scorecard

export default router;
