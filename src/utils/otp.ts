import crypto from "crypto";
import bcrypt from "bcryptjs";

// How long a code stays valid, and how many wrong guesses we allow.
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Makes a random 6-digit code, e.g. "048213".
//
// We use crypto.randomInt, NOT Math.random. Math.random is predictable enough
// that someone could work out what code you generated. crypto is designed
// for exactly this.
// ---------------------------------------------------------------------------
export function generateOtp(): string {
  const max = 10 ** OTP_LENGTH; // 1000000
  const number = crypto.randomInt(0, max); // 0 to 999999

  // padStart makes sure "213" becomes "000213" — always 6 characters.
  return String(number).padStart(OTP_LENGTH, "0");
}

// ---------------------------------------------------------------------------
// We store a HASH of the code, never the code itself — exactly like passwords.
//
// Why: if someone steals the database, they get useless scrambled text
// instead of a list of working codes they could use to take over accounts.
// ---------------------------------------------------------------------------
export function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

export function compareOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

// Returns a Date 10 minutes from now.
export function otpExpiryDate(): Date {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}
