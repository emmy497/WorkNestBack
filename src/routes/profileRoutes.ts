import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { getMyProfile, updateMyProfile, uploadCv } from "../controllers/profileController";
import { uploadCvFile } from "../middleware/upload";
import { protect } from "../middleware/auth";

const router = Router();

router.use(protect);

router.get("/me", getMyProfile);
router.patch("/me", updateMyProfile);

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

router.post("/me/cv", handleCvUpload, uploadCv);

export default router;
