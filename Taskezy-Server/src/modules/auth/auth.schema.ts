import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

// The ID token ("credential") Google Identity Services gives the browser.
export const googleLoginSchema = z.object({
  credential: z.string().min(20).max(5000)
});

export type LoginInput = z.infer<typeof loginSchema>;

// Second step of password login (email OTP) — see loginOtp.ts.
export const verifyLoginOtpSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  trustDevice: z.boolean().default(false)
});

export const resendLoginOtpSchema = z.object({
  challengeId: z.string().uuid()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters")
});
