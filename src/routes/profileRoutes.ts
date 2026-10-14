import { Router } from "express";
import { getMyProfile, updateMyProfile, uploadCv } from "../controllers/profileController";
import { handleCvUpload } from "../middleware/upload";
import { protect } from "../middleware/auth";

const router = Router();

router.use(protect);

router.get("/me", getMyProfile);
router.patch("/me", updateMyProfile);

router.post("/me/cv", handleCvUpload, uploadCv);

export default router;
