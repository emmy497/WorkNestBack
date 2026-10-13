import { Router } from "express";
import {
  register,
  verifyEmail,
  resendOtp,
  login,
  googleAuth,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  getMe,
} from "../controllers/authController";
import { protect, authorize } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/verify-email", verifyEmail);
router.post("/resend-otp", resendOtp);

router.post("/login", login);
router.post("/google", googleAuth);

router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);

router.get("/me", protect, getMe);

router.get("/admin-only", protect, authorize("admin"), (req, res) => {
  res.json({ message: "You are an admin", userId: req.userId });
});

export default router;
