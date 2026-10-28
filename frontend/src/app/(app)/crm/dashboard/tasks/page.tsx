"use client";

import React, { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useApp, Lead, LeadStatus, mapApiLeadToFrontendLead } from "@/context/AppContext";
import { apiGetLead } from "@/lib/apiClient";
import { useDialog } from "@/components/ui/DialogProvider";
import SalesPendingTasksTable from "@/components/dashboard/SalesPendingTasksTable";
import TaskSourceTabs, { TaskSource } from "@/components/dashboard/TaskSourceTabs";
import { TAB_BUCKETS, TeamTaskTab } from "@/components/dashboard/TeamTasksTable";
import LeadDetailDrawer from "@/components/crm/LeadDetailDrawer";
import LeadScheduleModal from "@/components/crm/LeadScheduleModal";
import { useLeadStatusScheduler } from "@/lib/leadScheduler";
import DateRangePicker, { DateRangeValue } from "@/components/ui/DateRangePicker";
import { PendingTask } from "@/lib/salesPendingTasks";

// Admin / Manager only — one team member's open tasks, opened by clicking
// their count in the dashboard's All Task / Pending Task table. Titled after
// the tab it came from; the Pending Task view lists only missed + pending. The link
// carries ?agent=&tab=&type= so this page lists exactly what was counted;
// the date range then narrows it by task due date.
function AgentTasksView() {
  const { pendingTasks, currentUser, updateLeadStatus, isDataLoading } = useApp();
  const { toast, prompt: promptDialog } = useDialog();
  const params = useSearchParams();
  const agent = params.get("agent") || "";
  const tab: TeamTaskTab = params.get("tab") === "pending" ? "pending" : "all";
  // One `type` param per selected task type; none (or the legacy "All") means every type.
  const taskTypes = useMemo(() => params.getAll("type").filter(t => t && t !== "All"), [params]);

  // Starts on the dashboard's Date Range when opened from it (?from=&to=).
  const [range, setRange] = useState<DateRangeValue | null>(() => {
    const from = params.get("from"), to = params.get("to");
    return from && to ? { start: from, end: to } : null;
  });
  // Leads vs Data Calling (source "Bulk Upload") — two separate task lists.
  const [source, setSource] = useState<TaskSource>("leads");
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);

  const taskFilter = useCallback((t: PendingTask) => {
    const assignee = (t.assignedTo || "Unassigned").trim().toLowerCase();
    if (assignee !== agent.trim().toLowerCase()) return false;
    if (!TAB_BUCKETS[tab].includes(t.bucket)) return false;
    if (t.isDataCalling !== (source === "dataCalling")) return false;
    if (taskTypes.length > 0 && !taskTypes.includes(t.taskType)) return false;
    if (range) {
      if (!t.dueAt) return false;
      const from = new Date(`${range.start}T00:00:00`);
      const to = new Date(`${range.end}T23:59:59.999`);
      if (t.dueAt < from || t.dueAt > to) return false;
    }
    return true;
  }, [agent, tab, taskTypes, range, source]);

  // Same Booking guard as the Leads page and the dashboard: booking a lead
  // auto-generates an invoice from its deal value, so a real value is required.
  const handleStatusChange = async (leadId: string, status: LeadStatus) => {
    if (status === "Booked") {
      const input = await promptDialog({
        title: "Enter deal value",
        message: "Enter the real deal value for this booking (INR):",
        label: "Deal value (INR)",
        confirmLabel: "Mark as Booked"
      });
      const dealValue = input ? parseFloat(input.replace(/[^0-9.]/g, "")) : NaN;
      if (!input || isNaN(dealValue) || dealValue <= 0) {
        toast("A valid deal value is required to mark a lead as Booked.", "warning");
        return;
      }
      updateLeadStatus(leadId, status, dealValue);
    } else {
      updateLeadStatus(leadId, status);
    }
  };
  // RNR/Call Back/Followup/Site Visit Scheduled are gated behind a
  // blocking popup before handleStatusChange actually runs. Called
  // unconditionally (before the isSalesMember early return below) since
  // it's a hook.
  const pendingTaskScheduler = useLeadStatusScheduler(handleStatusChange);

  const isSalesMember = currentUser?.role_type === "Member" && currentUser?.role !== "ADMIN";
  if (currentUser && isSalesMember) {
    return (
      <div className="bg-white rounded-2xl shadow-md p-8 text-center text-sm text-slate-500">
        This page is available to Admins and Managers only.{" "}
        <Link href="/crm/dashboard" className="text-blue-600 font-bold hover:underline">Back to Dashboard</Link>
      </div>
    );
  }

  const subtitle = [agent || "No team member selected", taskTypes.length > 0 ? taskTypes.join(", ") : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <Link href="/crm/dashboard" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#0B1E6E]">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>
        {/* Due dates can be upcoming, so no max date here */}
        <DateRangePicker value={range} onChange={setRange} maxDate="" />
      </div>

      <SalesPendingTasksTable
        // Remount per tab so search, bucket filter and page start fresh.
        key={source}
        title={tab === "pending" ? "Pending Task" : "All Task"}
        subtitle={subtitle}
        headerTabs={<TaskSourceTabs value={source} onChange={setSource} />}
        visibleBuckets={(["missed", "pending", "upcoming"] as const).filter(b => TAB_BUCKETS[tab].includes(b))}
        pendingTasks={pendingTasks}
        taskFilter={taskFilter}
        onViewLead={(leadId) => { apiGetLead(leadId).then(row => setDrawerLead(mapApiLeadToFrontendLead(row))).catch(() => setDrawerLead(null)); }}
        onStatusChange={(task, status) => pendingTaskScheduler.requestChange(
          { id: task.leadId!, name: task.name, phone: task.phone, assignedAgent: task.assignedTo },
          status
        )}
        isLoading={isDataLoading}
      />

      <LeadDetailDrawer
        lead={drawerLead}
        isOpen={drawerLead !== null}
        onClose={() => setDrawerLead(null)}
        onUpdateStatus={handleStatusChange}
      />

      {pendingTaskScheduler.pendingSchedule && (
        <LeadScheduleModal
          pending={pendingTaskScheduler.pendingSchedule}
          submitting={pendingTaskScheduler.submitting}
          error={pendingTaskScheduler.error}
          onCancel={pendingTaskScheduler.cancelSchedule}
          onConfirm={pendingTaskScheduler.confirmSchedule}
        />
      )}
    </div>
  );
}

export default function AgentTasksPage() {
  // useSearchParams needs a Suspense boundary under the App Router.
  return (
    <Suspense fallback={null}>
      <AgentTasksView />
    </Suspense>
  );
}
