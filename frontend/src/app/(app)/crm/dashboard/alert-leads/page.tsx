"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import LeadDrillDownPanel from "@/components/crm/LeadDrillDownPanel";
import { parseAlertLeadsDetail } from "@/lib/reportDetail";

// The leads a notification is about (e.g. "3 Leads Missed SLA", "Missed
// Leads Today: 6") — opened from the bell, the pop-up or a push tap. Lives
// under the CRM Dashboard, so Back / Close return there. Same list as a
// Reports number's detail page (LeadDrillDownPanel), same ?detail= shape.
function AlertLeadsView() {
  const router = useRouter();
  const detail = parseAlertLeadsDetail(useSearchParams().get("detail"));
  const backToDashboard = () => router.replace("/crm/dashboard");

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <button type="button" onClick={backToDashboard} className="ui-btn ui-btn-secondary border">
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </button>
      {detail ? (
        <LeadDrillDownPanel title={detail.title} baseFilters={detail.filters} onClose={backToDashboard} />
      ) : (
        <div className="bg-white rounded-2xl shadow-md p-8 text-center text-sm text-slate-500">
          This notification&apos;s leads could not be opened.
        </div>
      )}
    </div>
  );
}

export default function AlertLeadsPage() {
  return (
    <Suspense fallback={null}>
      <AlertLeadsView />
    </Suspense>
  );
}
