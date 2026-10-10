import { z } from "zod";
import { optionalIndianMobile, personName } from "../../utils/validation";

export const userIdParamSchema = z.object({ id: z.string().uuid() });

// Both page/pageSize are optional (unlike leads' listLeadsQuerySchema) so a
// bare `GET /users` with neither keeps returning the full active-user array
// exactly as before — every dropdown/name-resolution consumer across the app
// (assign-to, reassign, team pickers, AppContext's bulk load) depends on
// that. Only the admin Settings "Manage Users" table's own fetch passes
// page/pageSize to opt into real server-side pagination. Headcount here is
// realistically tens to low hundreds, so the cap is generous compared to
// leads' 500.
export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  // Matches the Settings "Manage Users" search box (name/email/phone).
  search: z.string().trim().max(200).optional(),
  // The CRM Manage Users stat cards (Admin / Managers / Agents); same
  // definitions as the card counts on that page.
  // "crm" = all three together (everyone the CRM's user directory shows).
  group: z.enum(["crm", "admin", "sales-managers", "sales-agents"]).optional()
});

export const createUserSchema = z.object({
  firstName: personName(100),
  // Initials are common surnames ("K", "N"), so one letter is enough here.
  lastName: personName(100, 1).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email address").max(254),
  // Empty means no phone on file; otherwise a 10-digit mobile (stored bare).
  phoneNumber: optionalIndianMobile,
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
  firstName: personName(100).optional(),
  lastName: personName(100, 1).optional().or(z.literal("")),
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

// Deleting a user who still holds leads: their leads are handed round-robin
// to `reassignTo` (active sales agents/managers, in the order given) and
// every reassigned lead gets `note`, required like any other reassign. A user
// with no leads can be deleted with an empty body.
export const deleteUserSchema = z.preprocess(
  (body) => body ?? {},
  z.object({
    reassignTo: z.array(z.string().uuid()).min(1).max(100).optional(),
    note: z.string().trim().min(1).max(2000).optional()
  }).refine((d) => !d.reassignTo || !!d.note, { message: "A note is required when reassigning leads.", path: ["note"] })
);
