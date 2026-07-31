import { z } from "zod";

export const userIdParamSchema = z.object({ id: z.string().uuid() });

export const createUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().email(),
  phoneNumber: z.string().max(30).optional(),
  designation: z.string().max(200).optional(),
  role: z.enum(["ADMIN", "FINANCE", "AGENT"]),
  roleType: z.enum(["MANAGER", "MEMBER"]).optional(),
  employmentType: z.enum(["FULL_TIME", "FREELANCER", "INTERN", "AGENCY"]).optional(),
  department: z.enum(["SALES", "TECH", "MARKETING", "FINANCE"]).optional(),
  // Never accept a pre-hashed password from the client — this is always the
  // plaintext initial password, hashed server-side in users.service.ts.
  password: z.string().min(8, "Password must be at least 8 characters")
});

export const editUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  designation: z.string().max(200).optional(),
  roleType: z.enum(["MANAGER", "MEMBER"]).optional(),
  department: z.enum(["SALES", "TECH", "MARKETING", "FINANCE"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
}).refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters")
});
