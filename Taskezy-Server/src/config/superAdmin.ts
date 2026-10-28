// The one informal "Super Admin" account — there's no distinct role for it
// in the schema (every other admin is a plain ADMIN). A handful of actions
// (deleting another admin, certain Access Control toggles, lead-property
// editing, the bulk phone-number search) are restricted to this one
// account specifically, not every ADMIN. Single source of truth — every
// other file that needs this constant imports it from here.
export const SUPER_ADMIN_EMAIL = "admin@realhubb.in";
