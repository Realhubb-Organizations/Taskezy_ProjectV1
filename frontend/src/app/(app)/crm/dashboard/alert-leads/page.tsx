"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import LeadDrillDownPanel from "@/components/crm/LeadDrillDownPanel";
import MissedRecordsList from "@/components/crm/MissedRecordsList";
import { parseAlertLeadsDetail } from "@/lib/reportDetail";

// What a notification opens — from the bell, the pop-up or a push tap: a
// missed alert's frozen missed-lead records (MissedRecordsList), or a list
// of live leads (LeadDrillDownPanel, e.g. "Leads Reassigned To You"). Lives
// under the CRM Dashboard, so Back / Close return there.
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
      {detail?.view === "missed-records" ? (
        <MissedRecordsList title={detail.title} filters={detail.filters} onClose={backToDashboard} />
      ) : detail ? (
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
