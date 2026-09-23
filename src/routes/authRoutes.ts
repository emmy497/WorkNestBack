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

// --- Public routes: you cannot be logged in yet ---------------------------

// Sign up flow
router.post("/register", register); //         POST /api/auth/register
router.post("/verify-email", verifyEmail); //  POST /api/auth/verify-email
router.post("/resend-otp", resendOtp); //      POST /api/auth/resend-otp

router.post("/login", login); //               POST /api/auth/login
router.post("/google", googleAuth); //         POST /api/auth/google

// Forgot password flow
router.post("/forgot-password", forgotPassword); //   POST /api/auth/forgot-password
router.post("/verify-reset-otp", verifyResetOtp); //  POST /api/auth/verify-reset-otp
router.post("/reset-password", resetPassword); //     POST /api/auth/reset-password

// --- Protected routes: a valid token is required --------------------------

// `protect` runs BEFORE getMe. If the token is missing or invalid,
// protect sends a 401 and getMe never runs at all.
router.get("/me", protect, getMe);

// Authentication AND authorization: logged in, and an admin.
router.get("/admin-only", protect, authorize("admin"), (req, res) => {
  res.json({ message: "You are an admin", userId: req.userId });
});

export default router;
