import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { getMyProfile, updateMyProfile, uploadCv } from "../controllers/profileController";
import { uploadCvFile } from "../middleware/upload";
import { protect } from "../middleware/auth";

const router = Router();

// Every route here requires being logged in — there is no "view a stranger's
// profile" endpoint (that would be a job for a separate, recruiter-only
// route later, with its own authorization rules).
router.use(protect);

router.get("/me", getMyProfile); //           GET   /api/profile/me
router.patch("/me", updateMyProfile); //       PATCH /api/profile/me

// A small wrapper so a bad upload (wrong file type, too large) comes back
// as a normal { message } JSON error instead of an unhandled exception.
function handleCvUpload(req: Request, res: Response, next: NextFunction) {
  uploadCvFile.single("cv")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "That file is too large — 5MB max" });
      }
      return res.status(400).json({ message: error.message });
    }
    if (error) {
      return res.status(400).json({ message: (error as Error).message });
    }
    next();
  });
}

router.post("/me/cv", handleCvUpload, uploadCv); // POST /api/profile/me/cv

export default router;
