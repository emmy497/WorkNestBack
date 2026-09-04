import { Router } from "express";
import { getOverview } from "../controllers/dashboardController";
import { protect, authorize } from "../middleware/auth";

const router = Router();

// Two different checks, and the order matters.
//
//   protect   — AUTHENTICATION. Who are you? No valid token means 401.
//   authorize — AUTHORIZATION. Are you allowed? Wrong role means 403.
//
// A candidate has a perfectly valid token, so `protect` lets them through.
// It's `authorize` that stops them seeing everyone else's applications.
router.use(protect);
router.use(authorize("admin", "recruiter"));

router.get("/overview", getOverview); //  GET /api/dashboard/overview

export default router;
