// Finance → Sales Tracker is open to these accounts only — they can see and
// do everything in it; nobody else (Admins included) can reach it. Mirrors
// frontend/src/lib/salesTracker.ts.
export const SALES_TRACKER_EMAILS = [
  "bhavuk@realhubb.in",
  "kushagra@realhubb.in",
  "rakesh@realhubb.in",
  "sanjeev@realhubb.in",
  "srikanth@realhubb.in"
];

export function hasSalesTrackerAccess(email: string | null | undefined): boolean {
  return !!email && SALES_TRACKER_EMAILS.includes(email.trim().toLowerCase());
}
