import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import { User, UserRole, OtpPurpose } from "../models/User";
import {
  generateOtp,
  hashOtp,
  compareOtp,
  otpExpiryDate,
  OTP_MAX_ATTEMPTS,
} from "../utils/otp";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from "../services/emailService";

function createToken(userId: string, role: UserRole): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing. Check your server/.env file.");
  }

  return jwt.sign({ userId, role }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  } as jwt.SignOptions);
}

function toSafeUser(user: {
  _id: unknown;
  name: string;
  email: string;
  role: UserRole;
  isVerified: boolean;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    isVerified: user.isVerified,
  };
}

async function issueOtp(userId: string, purpose: OtpPurpose): Promise<string> {
  const otp = generateOtp();

  await User.findByIdAndUpdate(userId, {
    $set: {
      otpHash: await hashOtp(otp),
      otpPurpose: purpose,
      otpExpiresAt: otpExpiryDate(),
      otpAttempts: 0,
    },
  });

  return otp;
}

async function deliverOtp(
  kind: OtpPurpose,
  email: string,
  name: string,
  otp: string
) {
  try {
    if (kind === "verify-email") {
      await sendVerificationEmail(email, name, otp);
    } else {
      await sendPasswordResetEmail(email, name, otp);
    }
  } catch (error) {
    console.error(`Could not send ${kind} email to ${email}:`, error);
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[dev] ${kind} code for ${email}: ${otp}`);
  }
}

async function clearOtp(userId: string) {
  await User.findByIdAndUpdate(userId, {
    $unset: { otpHash: "", otpPurpose: "", otpExpiresAt: "" },
    $set: { otpAttempts: 0 },
  });
}

async function checkOtp(
  userId: string,
  otp: string,
  expectedPurpose: OtpPurpose
): Promise<string | null> {
  const user = await User.findById(userId).select(
    "+otpHash +otpPurpose +otpExpiresAt +otpAttempts"
  );

  if (!user || !user.otpHash || !user.otpExpiresAt) {
    return "No code has been sent. Request a new one.";
  }

  if (user.otpPurpose !== expectedPurpose) {
    return "That code is not valid for this action.";
  }

  if (user.otpExpiresAt.getTime() < Date.now()) {
    return "That code has expired. Request a new one.";
  }

  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return "Too many incorrect attempts. Request a new code.";
  }

  const matches = await compareOtp(otp, user.otpHash);

  if (!matches) {
    await User.findByIdAndUpdate(userId, { $inc: { otpAttempts: 1 } });
    return "That code is incorrect.";
  }

  return null;
}

export async function  register(req: Request, res: Response) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Name, email and password are all required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });

    if (existing) {
      return res.status(409).json({ message: "That email is already in use" });
    }

    const user = await User.create({ name, email, password });

    const otp = await issueOtp(String(user._id), "verify-email");
    await deliverOtp("verify-email", user.email, user.name, otp);

    res.status(201).json({
      message: "Account created. Check your email for a verification code.",
      email: user.email,
    });
  } catch (error) {
    console.error("register failed:", error);
    res.status(500).json({ message: "Could not create your account" });
  }
}

export async function verifyEmail(req: Request, res: Response) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: "No account with that email" });
    }

    if (user.isVerified) {
      return res
        .status(400)
        .json({ message: "That email is already verified. Just log in." });
    }

    const problem = await checkOtp(String(user._id), otp, "verify-email");

    if (problem) {
      return res.status(400).json({ message: problem });
    }

    user.isVerified = true;
    await user.save();
    await clearOtp(String(user._id));

    sendWelcomeEmail(user.email, user.name).catch((error) => {
      console.error(`Could not send welcome email to ${user.email}:`, error);
    });

    const token = createToken(String(user._id), user.role);

    res.json({ token, user: toSafeUser(user) });
  } catch (error) {
    console.error("verifyEmail failed:", error);
    res.status(500).json({ message: "Could not verify your email" });
  }
}

export async function resendOtp(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user || user.isVerified) {
      return res.json({ message: "If that account exists, a code is on its way." });
    }

    const otp = await issueOtp(String(user._id), "verify-email");
    await deliverOtp("verify-email", user.email, user.name, otp);

    res.json({ message: "If that account exists, a code is on its way." });
  } catch (error) {
    console.error("resendOtp failed:", error);
    res.status(500).json({ message: "Could not resend the code" });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password"
    );

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordMatches = await user.comparePassword(password);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      const otp = await issueOtp(String(user._id), "verify-email");
      await deliverOtp("verify-email", user.email, user.name, otp);

      return res.status(403).json({
        message: "Please verify your email first. We've sent you a new code.",
        needsVerification: true,
        email: user.email,
      });
    }

    const token = createToken(String(user._id), user.role);

    res.json({ token, user: toSafeUser(user) });
  } catch (error) {
    console.error("login failed:", error);
    res.status(500).json({ message: "Could not log you in" });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    const sameReply = {
      message: "If an account exists for that email, we've sent a code.",
    };

    if (!user) {
      return res.json(sameReply);
    }

    const otp = await issueOtp(String(user._id), "reset-password");
    await deliverOtp("reset-password", user.email, user.name, otp);

    res.json(sameReply);
  } catch (error) {
    console.error("forgotPassword failed:", error);
    res.status(500).json({ message: "Could not send the reset code" });
  }
}

export async function verifyResetOtp(req: Request, res: Response) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(400).json({ message: "That code is incorrect." });
    }

    const problem = await checkOtp(String(user._id), otp, "reset-password");

    if (problem) {
      return res.status(400).json({ message: problem });
    }

    res.json({ message: "Code verified." });
  } catch (error) {
    console.error("verifyResetOtp failed:", error);
    res.status(500).json({ message: "Could not verify that code" });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res
        .status(400)
        .json({ message: "Email, code and new password are all required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(400).json({ message: "That code is incorrect." });
    }

    const problem = await checkOtp(String(user._id), otp, "reset-password");

    if (problem) {
      return res.status(400).json({ message: problem });
    }

    await User.findByIdAndUpdate(user._id, {
      $set: {
        password: await bcrypt.hash(newPassword, 10),
        isVerified: true,
        otpAttempts: 0,
      },
      $unset: { otpHash: "", otpPurpose: "", otpExpiresAt: "" },
    });

    res.json({ message: "Password updated. You can log in now." });
  } catch (error) {
    console.error("resetPassword failed:", error);
    res.status(500).json({ message: "Could not reset your password" });
  }
}

export async function googleAuth(req: Request, res: Response) {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ message: "Missing Google access token" });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      throw new Error("GOOGLE_CLIENT_ID is missing. Check your server/.env file.");
    }

    const tokenInfoRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(
        accessToken
      )}`
    );

    if (!tokenInfoRes.ok) {
      return res.status(401).json({ message: "Invalid Google token" });
    }

    const tokenInfo = (await tokenInfoRes.json()) as {
      aud?: string;
      sub?: string;
      email?: string;
      email_verified?: string;
      name?: string;
    };

    if (tokenInfo.aud !== clientId) {
      return res.status(401).json({ message: "Invalid Google token" });
    }

    if (!tokenInfo.email || tokenInfo.email_verified !== "true") {
      return res
        .status(401)
        .json({ message: "Your Google email is not verified" });
    }

    const email = tokenInfo.email.toLowerCase();
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: tokenInfo.name || email,
        email,
        googleId: tokenInfo.sub,
        isVerified: true,
      });
    } else if (!user.googleId) {
      user.googleId = tokenInfo.sub;
      user.isVerified = true;
      await user.save();
    }

    const token = createToken(String(user._id), user.role);

    res.json({ token, user: toSafeUser(user) });
  } catch (error) {
    console.error("googleAuth failed:", error);
    res.status(500).json({ message: "Could not sign you in with Google" });
  }
}

export async function getMe(req: Request, res: Response) {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user: toSafeUser(user) });
  } catch (error) {
    console.error("getMe failed:", error);
    res.status(500).json({ message: "Could not load your account" });
  }
}
