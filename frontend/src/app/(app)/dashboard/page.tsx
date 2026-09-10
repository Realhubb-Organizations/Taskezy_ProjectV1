"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Bare /dashboard used to branch its own content by department/activeSystem
// (so the same URL showed a generic "Hey, {name}!" overview or a
// module-specific dashboard depending on runtime state) and was also
// registered as the CRM sidebar group's own "Dashboard" item, force-
// expanding CRM any time it rendered. That content now lives at /home,
// /crm/dashboard, /hrms/dashboard and /finance/dashboard. This redirect
// only exists so old bookmarks/links to bare /dashboard keep working.
export default function DashboardRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/home");
  }, [router]);
  return null;
}
