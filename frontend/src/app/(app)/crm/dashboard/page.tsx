"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useApp, Lead } from "@/context/AppContext";
import AddLeadModal from "@/components/crm/AddLeadModal";
import PendingLeadsTable, { PendingRow } from "@/components/dashboard/PendingLeadsTable";
import { ChevronRight, Plus, CheckCircle } from "lucide-react";

// CRM's own overview — moved out of the old bare /dashboard route (which
// branched its content by department/activeSystem, so the same URL showed a
// different page depending on runtime state, and was also registered as the
// CRM sidebar group's own "Dashboard" item — force-expanding CRM any time
// this rendered, even for users who weren't in CRM at all) into its own
// real path, alongside /hrms/dashboard and /finance/dashboard.
export default function CrmDashboardPage() {
  const { leads, properties, users, currentUser, addLead } = useApp();

  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "week" | "month" | "all">("today");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const dateInRange = (dateStr: string | undefined, range: typeof dateRange, refNow: Date): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    if (range === "all") return true;
    const startOfToday = new Date(refNow.getFullYear(), refNow.getMonth(), refNow.getDate());
    if (range === "today") return d.toDateString() === refNow.toDateString();
    if (range === "yesterday") {
      const y = new Date(startOfToday);
      y.setDate(y.getDate() - 1);
      return d.toDateString() === y.toDateString();
    }
    if (range === "week") {
      const weekAgo = new Date(startOfToday);
      weekAgo.setDate(weekAgo.getDate() - 6);
      return d >= weekAgo;
    }
    // month
    return d.getMonth() === refNow.getMonth() && d.getFullYear() === refNow.getFullYear();
  };

  const sortedLogs = (l: Lead) => [...(l.logs || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const latestLogMessage = (l: Lead): string => {
    const logs = sortedLogs(l);
    return logs.length > 0 ? logs[0].message : "No feedback yet";
  };

  // "When did this lead actually enter its current pending state" — the most
  // recent log entry, not the lead's original createdAtStr (which stays fixed
  // from lead creation and would make a follow-up look "due" from weeks ago).
  const formatDateTime = (iso: string | undefined): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const lastActivityIso = (l: Lead): string | undefined => {
    const logs = sortedLogs(l);
    return logs.length > 0 ? logs[0].timestamp : l.createdAtStr;
  };

  const lastActivityTime = (l: Lead): string => formatDateTime(lastActivityIso(l));

  const isSalesMember = currentUser?.role_type === "Member" && currentUser?.role !== "ADMIN";

  const scopedLeads = leads.filter(l => {
    if (isSalesMember) {
      return l.assignedAgent.toLowerCase() === currentUser?.name.toLowerCase();
    }
    return true;
  });

  const now = new Date();
  // "Date Range" filters by when a lead was *created* — meaningful for "how
  // many leads came in today", but wrong for a status like RNR: a lead
  // created last week that gets marked RNR today would be created-date
  // "not today" and silently disappear from the count even though it's
  // sitting in RNR right now. Total Leads/New Leads use it (they're about
  // intake volume); every other card below reflects the lead's current
  // status regardless of when it was created — a live pipeline snapshot,
  // not an intake-date snapshot.
  const rangeLeads = scopedLeads.filter(l => dateInRange(l.createdAtStr, dateRange, now));

  const totalLeadsCount = rangeLeads.length;
  const newLeadsCount = rangeLeads.filter(l => l.status === "New Lead").length;
  const rnrCount = scopedLeads.filter(l => l.status === "RNR").length;
  // "Call Backs" deliberately reads the lead's own status (like every other
  // card here) rather than the followup_calls table: a FollowupCall row is
  // only created when an agent also fills in the optional reminder date/time
  // picker after changing status, so sourcing this metric from that table
  // would silently show 0 even when leads are genuinely sitting in Call Back.
  const callBacksCount = scopedLeads.filter(l => l.status === "Call Back").length;
  const followUpsCount = scopedLeads.filter(l => l.status === "Follow-ups").length;
  const siteVisitScheduledCount = scopedLeads.filter(l => l.status === "Visit Schedule").length;
  const siteVisitDoneCount = scopedLeads.filter(l => l.status === "Site Visit").length;

  const statCards: { label: string; value: number; color: string }[] = [
    { label: "Total Leads", value: totalLeadsCount, color: "text-slate-900" },
    { label: "New Leads", value: newLeadsCount, color: "text-[#0084FF]" },
    { label: "RNR", value: rnrCount, color: "text-[#FF0000]" },
    { label: "Call Backs", value: callBacksCount, color: "text-[#FF8C00]" },
    { label: "Follow Ups", value: followUpsCount, color: "text-[#0084FF]" },
    { label: "Site Visit Scheduled", value: siteVisitScheduledCount, color: "text-[#FF0000]" },
    { label: "Site Visit Done", value: siteVisitDoneCount, color: "text-[#015814]" }
  ];

  const byMostRecentActivity = (a: Lead, b: Lead) => new Date(lastActivityIso(b) || 0).getTime() - new Date(lastActivityIso(a) || 0).getTime();

  const pendingFollowUpLeads = scopedLeads.filter(l => l.status === "Follow-ups").sort(byMostRecentActivity);
  const pendingCallBackLeads = scopedLeads.filter(l => l.status === "Call Back").sort(byMostRecentActivity);

  // Real sales roster + property list, same source the Leads page's Add Lead
  // modal already uses — reused here so "+ Upload Leads" is a real, working
  // entry point rather than a second, divergent implementation.
  const propertiesList = properties.map(p => p.name);
  const agentsList = users.filter(u => u.department === "SALES" && u.status !== "INACTIVE").map(u => u.name);

  const handleUploadManualLead = (data: { name: string; phone: string; email: string; agent: string; source: string; property: string; note: string }) => {
    const res = addLead({
      name: data.name,
      phone: data.phone,
      email: data.email,
      assignedAgent: data.agent,
      campaign: data.source,
      property: data.property || undefined,
      leadScore: 85,
      createdAtStr: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    });
    if (res.success) {
      setIsUploadOpen(false);
      setUploadMsg(`Successfully ingested lead for: ${data.name}`);
      setTimeout(() => setUploadMsg(""), 4000);
    } else {
      alert(`Ingestion failed: ${res.error}`);
    }
  };

  const handleUploadBulkLeads = (data: { assignmentMode: "project" | "agent"; target: string; fileName: string }) => {
    alert(`Bulk Import Started!\nFile: ${data.fileName}\nAssignment Mode: ${data.assignmentMode} (${data.target})\nProcessing rows...`);
    setIsUploadOpen(false);
  };

  const followUpRows: PendingRow[] = pendingFollowUpLeads.map(l => ({
    id: l.id,
    time: lastActivityTime(l),
    name: l.name,
    phone: l.phone,
    assignedTo: l.assignedAgent,
    feedback: latestLogMessage(l),
    property: l.property || "Not set",
    leadId: l.id
  }));

  const callBackRows: PendingRow[] = pendingCallBackLeads.map(l => ({
    id: l.id,
    time: lastActivityTime(l),
    name: l.name,
    phone: l.phone,
    assignedTo: l.assignedAgent,
    feedback: latestLogMessage(l),
    property: l.property || "Not set",
    leadId: l.id
  }));

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1">
            {isSalesMember
              ? `Personal workspace for ${currentUser?.name}. Viewing active leads and scheduled callbacks.`
              : "Global sales operations tracking, pipelines distribution, and performance logs."}
          </p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          className="inline-flex items-center gap-2 bg-[#0B0447] hover:opacity-90 text-white px-6 py-3.5 rounded-2xl text-base font-semibold transition-all shadow-md shrink-0"
        >
          <Plus className="h-5 w-5" />
          Upload Leads
        </button>
      </div>

      {uploadMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 rounded-xl font-bold flex items-center gap-2 animate-fade-in shadow-sm">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{uploadMsg}</span>
        </div>
      )}

      {/* Toolbar: date range + drill-down link */}
      <div className="flex flex-wrap justify-between items-center gap-3 bg-white shadow-sm rounded-xl px-5 py-4">
        <div className="flex items-center gap-2 text-base text-slate-500">
          <span>Date Range</span>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
            className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
        </div>
        <Link href="/dashboard/reports" className="text-base font-semibold text-[#0F2D90] hover:underline">
          View Detailed Analytics
        </Link>
      </div>

      {/* Stat row — the CRM funnel snapshot for the selected date range */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {statCards.map((s) => (
          <Link
            key={s.label}
            href="/dashboard/crm"
            className="bg-white rounded-2xl shadow-md px-4 py-5 hover:shadow-lg transition-shadow"
          >
            <span className="flex items-center justify-between text-sm font-medium text-slate-500">
              {s.label} <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
            </span>
            <span className={`text-3xl font-extrabold block mt-2 ${s.color}`}>{s.value}</span>
          </Link>
        ))}
      </div>

      {/* Pending Follow ups — leads currently sitting in the Follow-ups status */}
      <PendingLeadsTable title="Pending Follow ups" rows={followUpRows} />

      {/* Pending Call Backs — the operational followup_calls callback queue */}
      <PendingLeadsTable title="Pending Call Backs" rows={callBackRows} />

      <AddLeadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSubmitManual={handleUploadManualLead}
        onSubmitBulk={handleUploadBulkLeads}
        agentsList={agentsList}
        propertiesList={propertiesList}
      />
    </div>
  );
}
