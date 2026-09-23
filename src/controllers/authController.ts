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

// ---------------------------------------------------------------------------
// What is a token?
//
// After you log in, the server gives you a token. It is a signed string that
// says "this is user 123, and they are a candidate". You send it back with
// every future request, and the server can trust it because only the server
// knows the secret used to sign it.
//
// It replaces having to send your password on every single request.
// ---------------------------------------------------------------------------
function createToken(userId: string, role: UserRole): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing. Check your server/.env file.");
  }

  // Never put anything secret in the payload: anyone can READ a token,
  // they just can't CHANGE it without the secret.
  return jwt.sign({ userId, role }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  } as jwt.SignOptions);
}

// A small helper so we never accidentally send the password back.
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

// ---------------------------------------------------------------------------
// Creates a fresh code, saves the HASH of it on the user, and returns the
// real code so we can email it.
//
// Used by three places: register, resend, and forgot-password.
// ---------------------------------------------------------------------------
async function issueOtp(userId: string, purpose: OtpPurpose): Promise<string> {
  const otp = generateOtp();

  await User.findByIdAndUpdate(userId, {
    $set: {
      otpHash: await hashOtp(otp),
      otpPurpose: purpose,
      otpExpiresAt: otpExpiryDate(),
      otpAttempts: 0, // a new code resets the guess counter
    },
  });

  return otp;
}

// ---------------------------------------------------------------------------
// Sends the code by email.
//
// If the email provider is down or misconfigured, we do NOT fail the whole
// request — the account was still created, and the user can hit "resend".
// We log the problem so you can see it in the terminal.
//
// While developing, we also print the code itself, so you can carry on
// testing even when email delivery isn't working yet. This never happens
// in production.
// ---------------------------------------------------------------------------
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

// Wipes the code once it has been used, so it can never be reused.
async function clearOtp(userId: string) {
  await User.findByIdAndUpdate(userId, {
    $unset: { otpHash: "", otpPurpose: "", otpExpiresAt: "" },
    $set: { otpAttempts: 0 },
  });
}

// ---------------------------------------------------------------------------
// Shared checking logic for both OTP flows.
//
// Returns an error message string if something is wrong, or null if the
// code is good.
// ---------------------------------------------------------------------------
async function checkOtp(
  userId: string,
  otp: string,
  expectedPurpose: OtpPurpose
): Promise<string | null> {
  // The OTP fields are select:false, so we have to ask for them by name.
  const user = await User.findById(userId).select(
    "+otpHash +otpPurpose +otpExpiresAt +otpAttempts"
  );

  if (!user || !user.otpHash || !user.otpExpiresAt) {
    return "No code has been sent. Request a new one.";
  }

  // Was this code issued for a different job?
  if (user.otpPurpose !== expectedPurpose) {
    return "That code is not valid for this action.";
  }

  // Has it expired?
  if (user.otpExpiresAt.getTime() < Date.now()) {
    return "That code has expired. Request a new one.";
  }

  // Too many wrong guesses? A 6-digit code is only a million possibilities,
  // so without this limit someone could simply try them all.
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return "Too many incorrect attempts. Request a new code.";
  }

  const matches = await compareOtp(otp, user.otpHash);

  if (!matches) {
    // Count the failed guess.
    await User.findByIdAndUpdate(userId, { $inc: { otpAttempts: 1 } });
    return "That code is incorrect.";
  }

  return null; // all good
}

// ===========================================================================
// POST /api/auth/register
//
// Creates the account as UNVERIFIED and emails a code.
// No token is returned yet — they have to verify first.
// ===========================================================================
export async function register(req: Request, res: Response) {
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

// ===========================================================================
// POST /api/auth/verify-email   { email, otp }
//
// Checks the code, marks the account verified, and logs them in.
// ===========================================================================
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

    // Send the welcome email now that they're a confirmed user.
    //
    // Note there is no `await` on the outer call. Sending an email can take
    // a second or two, and the user should not have to wait for it just to
    // finish logging in. We "fire and forget", and log it if it fails.
    sendWelcomeEmail(user.email, user.name).catch((error) => {
      console.error(`Could not send welcome email to ${user.email}:`, error);
    });

    // Verified — now they get a token and are logged in.
    const token = createToken(String(user._id), user.role);

    res.json({ token, user: toSafeUser(user) });
  } catch (error) {
    console.error("verifyEmail failed:", error);
    res.status(500).json({ message: "Could not verify your email" });
  }
}

// ===========================================================================
// POST /api/auth/resend-otp   { email }
//
// For when the first email didn't arrive or the code expired.
// ===========================================================================
export async function resendOtp(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Same reply whether or not the account exists — see the note in
    // forgotPassword below for why.
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

// ===========================================================================
// POST /api/auth/login
// ===========================================================================
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    // password has select:false in the schema, so ask for it explicitly.
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password"
    );

    // Both failures below give the SAME message on purpose.
    //
    // If we said "no account with that email" we would be telling an
    // attacker which emails are registered. Keep it vague.
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordMatches = await user.comparePassword(password);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Correct password, but they never confirmed the email address.
    // 403 (not 401) because we DO know who they are — they're just not
    // allowed in yet.
    if (!user.isVerified) {
      // Send them a fresh code so they aren't stuck.
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

// ===========================================================================
// POST /api/auth/forgot-password   { email }
// ===========================================================================
export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // IMPORTANT: we reply the same way whether or not the account exists.
    //
    // If we said "no account with that email", anyone could type in emails
    // one by one and build a list of who has a WorkNest account. Staying
    // vague here costs the honest user nothing.
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

// ===========================================================================
// POST /api/auth/verify-reset-otp   { email, otp }
//
// Checks a reset-password code WITHOUT resetting anything yet. This lets the
// frontend show a dedicated "code was correct" step before asking for a new
// password, instead of only finding out the code was wrong after the user
// has already typed a new password.
//
// The actual /reset-password call below still re-checks the code itself
// before touching the password — this endpoint is just for the UI flow, it
// isn't a security boundary on its own.
// ===========================================================================
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

// ===========================================================================
// POST /api/auth/reset-password   { email, otp, newPassword }
// ===========================================================================
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

    // Hash the new password directly here.
    //
    // We can't use user.save() with the pre-save hook, because we also need
    // to clear the OTP in the same operation — so we do both in one update.
    await User.findByIdAndUpdate(user._id, {
      $set: {
        password: await bcrypt.hash(newPassword, 10),
        isVerified: true, // proving email access also verifies it
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

// ===========================================================================
// POST /api/auth/google   { accessToken }
//
// The frontend gets an OAuth access token straight from Google (the
// "implicit" flow) and hands it to us. We do NOT trust it as-is — anyone
// could send us any access token. Instead we ask Google what it's for:
// tokeninfo tells us who it actually belongs to (aud) and which email it's
// for, so a token minted for some other app can't be replayed against us.
// ===========================================================================
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

    // This token was issued for a DIFFERENT app — never trust it.
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
        isVerified: true, // Google already confirmed this email
      });
    } else if (!user.googleId) {
      // An account already exists with this email (probably password-based)
      // — link the Google identity to it instead of failing on the
      // duplicate email.
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

// ===========================================================================
// GET /api/auth/me
//
// Returns the logged-in user. The frontend calls this on page load to find
// out whether the saved token is still valid.
//
// Only runs AFTER the `protect` middleware, which is what sets req.userId.
// ===========================================================================
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
