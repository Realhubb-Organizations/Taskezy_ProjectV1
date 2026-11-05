"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import LeadDrillDownPanel from "@/components/crm/LeadDrillDownPanel";
import MissedCountBadge from "@/components/crm/MissedCountBadge";
import { useLeadQuickView } from "@/components/crm/useLeadQuickView";
import { MISSED_TASK_COLUMNS, PagedReportCard, SiteVisitCardList } from "./TeamReports";
import { maskPhone } from "@/lib/maskPII";
import {
  apiGetTeamReport,
  apiListFollowupsPage,
  apiListTeamMissedTasks,
  type ApiFollowupRow,
  type TeamSiteVisitLead
} from "@/lib/apiClient";
import type { ReportDetail } from "@/lib/reportDetail";

// Reports → a number → this page: the leads / tasks / site visits behind it,
// with Back to the report. Lead rows open the lead's details (the same panel
// the Leads page uses). Opened inside the Reports page (?detail=…), so Back
// keeps the report's filters — see app/(app)/dashboard/reports/page.tsx.

const formatDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "-";

const SITE_VISIT_COUNT = { label: "Times Scheduled", value: (r: TeamSiteVisitLead) => r.siteVisitCount };
const SITE_VISIT_MISSED = { label: "SV Missed", value: (r: TeamSiteVisitLead) => r.rangeMissedCount };
const SITE_VISIT_UPCOMING = { label: "SV Scheduled", value: (r: TeamSiteVisitLead) => r.rangeUpcomingCount };

function SiteVisitsDetail({ detail, onOpenLead }: { detail: Extract<ReportDetail, { view: "site-visits" }>; onOpenLead: (id: string) => void }) {
  const [rows, setRows] = useState<TeamSiteVisitLead[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(detail.filters);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGetTeamReport(detail.filters)
      .then(r => { if (!cancelled) setRows(r.siteVisits.leads); })
      .catch(() => { /* keep the last rows */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // key stands for detail.filters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const shown = useMemo(() => rows.filter(r => (detail.match === "missed" ? r.rangeMissedCount > 0 : detail.match === "upcoming" ? r.rangeUpcomingCount > 0 : true)), [rows, detail.match]);
  return (
    <SiteVisitCardList
      title={detail.title}
      rows={shown}
      loading={loading}
      count={detail.match === "missed" ? SITE_VISIT_MISSED : detail.match === "upcoming" ? SITE_VISIT_UPCOMING : SITE_VISIT_COUNT}
      onRowClick={r => onOpenLead(r.leadId)}
    />
  );
}

const MISSED_FOLLOWUP_COLUMNS: { label: string; render: (r: ApiFollowupRow) => React.ReactNode }[] = [
  {
    label: "Lead Name",
    render: r => (
      <>
        <p className="font-semibold text-slate-800">{r.lead_name}</p>
        {r.phone && <p className="text-[10px] text-slate-400 font-mono">{maskPhone(r.phone)}</p>}
        <MissedCountBadge count={r.lead_missed_count ?? undefined} />
      </>
    )
  },
  { label: "Salesperson", render: r => r.assigned_to_name ?? "—" },
  { label: "Task", render: r => (r.call_type === "SITE_VISIT" ? "Site Visit" : r.call_type === "MEETING" ? "Meeting" : "Call Back") },
  { label: "Was Due", render: r => formatDateTime(r.scheduled_at) }
];

export default function ReportDetailView({ detail, onBack }: { detail: ReportDetail; onBack: () => void }) {
  const quickView = useLeadQuickView();
  const resetKey = JSON.stringify(detail);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* The list below carries the title. */}
      <button type="button" onClick={onBack} className="ui-btn ui-btn-secondary border">
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </button>

      {detail.view === "leads" && (
        // Rows open the lead's details (LeadDrillDownPanel's own lead panel).
        <LeadDrillDownPanel title={detail.title} baseFilters={detail.filters} onClose={onBack} />
      )}

      {detail.view === "missed-tasks" && (
        <PagedReportCard
          title={detail.title}
          columns={MISSED_TASK_COLUMNS}
          fetchPage={(page, size) => apiListTeamMissedTasks(detail.filters, page, size)}
          resetKey={resetKey}
          rowKey={r => r.id}
          emptyText="No missed tasks."
          rowLabel="Task"
          onRowClick={r => quickView.open(r.lead_id)}
        />
      )}

      {detail.view === "site-visits" && <SiteVisitsDetail detail={detail} onOpenLead={id => quickView.open(id)} />}

      {detail.view === "missed-followups" && (
        <PagedReportCard
          title={detail.title}
          columns={MISSED_FOLLOWUP_COLUMNS}
          fetchPage={async (page, size) => {
            const r = await apiListFollowupsPage(page, size, { everMissed: true, assignedToId: detail.agentIds, dateFrom: detail.dateFrom, dateTo: detail.dateTo });
            return { rows: r.rows, totalCount: r.totalCount };
          }}
          resetKey={resetKey}
          rowKey={r => r.id}
          emptyText="No missed follow-ups."
          rowLabel="Follow-up"
          onRowClick={r => { if (r.lead_id) quickView.open(r.lead_id); }}
        />
      )}

      {quickView.drawer}
    </div>
  );
}
