// The one informal "Super Admin" account — no distinct role in the schema,
// every other admin is a plain ADMIN. Mirrors the backend's own
// SUPER_ADMIN_EMAIL (Taskezy-Server/src/config/superAdmin.ts) — single
// source of truth on this side, every file that needs this check imports
// from here instead of hardcoding the email.
export const SUPER_ADMIN_EMAIL = "tech@realhubb.in";

export function isSuperAdminUser(email: string | undefined | null): boolean {
  return email === SUPER_ADMIN_EMAIL;
}
