import { Router } from "express";
import {
  createApplication,
  getMyApplications,
  getApplicationForJob,
  getApplicationPrefill,
} from "../controllers/applicationController";
import { protect } from "../middleware/auth";

const router = Router();

// You have to be logged in to apply to anything, or to see your own
// applications — so protect every route in this file at once.
router.use(protect);

// NOTE on ordering: "/prefill" and "/job/:jobId" are listed BEFORE any
// "/:id" route would be. Express matches top to bottom, so a "/:id" route
// placed first would swallow "/prefill" and treat "prefill" as an id.
router.get("/prefill", getApplicationPrefill); //      GET  /api/applications/prefill
router.get("/job/:jobId", getApplicationForJob); //    GET  /api/applications/job/:jobId
router.get("/", getMyApplications); //                 GET  /api/applications
router.post("/:jobId", createApplication); //          POST /api/applications/:jobId

export default router;
