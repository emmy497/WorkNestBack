import crypto from "crypto";
import bcrypt from "bcryptjs";

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  const max = 10 ** OTP_LENGTH;
  const number = crypto.randomInt(0, max);

  return String(number).padStart(OTP_LENGTH, "0");
}

export function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

export function compareOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

export function otpExpiryDate(): Date {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}
