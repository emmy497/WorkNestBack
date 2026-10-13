import { Router } from "express";
import {
  getSavedJobs,
  getSavedJobIds,
  saveJob,
  unsaveJob,
} from "../controllers/savedJobController";
import { protect } from "../middleware/auth";

const router = Router();

router.use(protect);

router.get("/", getSavedJobs);
router.get("/ids", getSavedJobIds);
router.post("/:jobId", saveJob);
router.delete("/:jobId", unsaveJob);

export default router;
