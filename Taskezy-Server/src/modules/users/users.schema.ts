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
  // Who this person reports to — nullable-by-omission (top-level managers/
  // admins have no manager). Not enforced to be role_type=MANAGER at the
  // schema level; the service layer checks that, since it needs a DB lookup.
  managerId: z.string().uuid().optional(),
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
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  // null clears it (e.g. promoting someone to no longer report to anyone);
  // omitted leaves it unchanged, same convention as leads' editLeadSchema.
  managerId: z.string().uuid().nullable().optional()
}).refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters")
});
