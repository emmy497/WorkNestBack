import { Router } from "express";
import {
  createApplication,
  getMyApplications,
  getApplicationForJob,
  getApplicationPrefill,
} from "../controllers/applicationController";
import { protect, identify } from "../middleware/auth";

const router = Router();

// Everything about "MY" applications needs a real account — but applying
// itself doesn't (see createApplication for the guest path), so this file
// no longer protects every route at once.

// NOTE on ordering: "/prefill" and "/job/:jobId" are listed BEFORE any
// "/:id" route would be. Express matches top to bottom, so a "/:id" route
// placed first would swallow "/prefill" and treat "prefill" as an id.
router.get("/prefill", protect, getApplicationPrefill); //      GET  /api/applications/prefill
router.get("/job/:jobId", protect, getApplicationForJob); //    GET  /api/applications/job/:jobId
router.get("/", protect, getMyApplications); //                 GET  /api/applications

// identify (not protect): a logged-in candidate still gets tied to their
// account, but a guest can submit too, with no token at all.
router.post("/:jobId", identify, createApplication); //         POST /api/applications/:jobId

export default router;
