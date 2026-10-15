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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters")
});
