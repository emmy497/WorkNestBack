import { Router } from "express";
import {
  getSavedJobs,
  getSavedJobIds,
  saveJob,
  unsaveJob,
} from "../controllers/savedJobController";
import { protect } from "../middleware/auth";

const router = Router();

// Every route here is personal to one user, so they ALL need a valid token.
//
// router.use() applies the middleware to every route below it, rather than
// repeating `protect` on each line.
router.use(protect);

router.get("/", getSavedJobs); //            GET    /api/saved-jobs
router.get("/ids", getSavedJobIds); //       GET    /api/saved-jobs/ids
router.post("/:jobId", saveJob); //          POST   /api/saved-jobs/:jobId
router.delete("/:jobId", unsaveJob); //      DELETE /api/saved-jobs/:jobId

export default router;
