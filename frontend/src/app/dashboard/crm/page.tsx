"use client";

import React, { Suspense } from "react";
import LeadDashboardClassic from "@/components/crm/LeadDashboardClassic";

export default function CRMPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center bg-slate-50 text-xs font-bold text-slate-400">Loading leads console...</div>}>
      <LeadDashboardClassic />
    </Suspense>
  );
}
