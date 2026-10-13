import { Router } from "express";
import { getOverview } from "../controllers/dashboardController";
import { protect, authorize } from "../middleware/auth";

const router = Router();

router.use(protect);
router.use(authorize("admin", "recruiter"));

router.get("/overview", getOverview);

export default router;
