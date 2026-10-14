import { Router } from "express";
import {
  createApplication,
  getMyApplications,
  getApplicationForJob,
  getApplicationPrefill,
  uploadApplicationCv,
} from "../controllers/applicationController";
import { protect, identify } from "../middleware/auth";
import { handleCvUpload } from "../middleware/upload";
import { cvUploadLimiter } from "../middleware/rateLimit";

const router = Router();

router.get("/prefill", protect, getApplicationPrefill);
router.get("/job/:jobId", protect, getApplicationForJob);
router.get("/", protect, getMyApplications);

router.post("/cv", cvUploadLimiter, identify, handleCvUpload, uploadApplicationCv);
router.post("/:jobId", identify, createApplication);

export default router;
