"use client";

import React, { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";
import SalesPendingTasksTable from "@/components/dashboard/SalesPendingTasksTable";
import { TAB_BUCKETS, TeamTaskTab } from "@/components/dashboard/TeamTasksTable";
import LeadDetailDrawer from "@/components/crm/LeadDetailDrawer";
import DateRangePicker, { DateRangeValue } from "@/components/ui/DateRangePicker";
import { PendingTask } from "@/lib/salesPendingTasks";

// Admin / Manager only — one team member's open tasks, opened by clicking
// their count in the dashboard's All Task / Pending Task table. The link
// carries ?agent=&tab=&type= so this page lists exactly what was counted;
// the date range then narrows it by task due date.
function AgentTasksView() {
  const { leads, followupCalls, currentUser, updateLeadStatus, isDataLoading } = useApp();
  const params = useSearchParams();
  const agent = params.get("agent") || "";
  const tab: TeamTaskTab = params.get("tab") === "pending" ? "pending" : "all";
  const taskType = params.get("type") || "All";

  const [range, setRange] = useState<DateRangeValue | null>(null);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);

  const taskFilter = useCallback((t: PendingTask) => {
    const assignee = (t.assignedTo || "Unassigned").trim().toLowerCase();
    if (assignee !== agent.trim().toLowerCase()) return false;
    if (!TAB_BUCKETS[tab].includes(t.bucket)) return false;
    if (taskType !== "All" && t.taskType !== taskType) return false;
    if (range) {
      if (!t.dueAt) return false;
      const from = new Date(`${range.start}T00:00:00`);
      const to = new Date(`${range.end}T23:59:59.999`);
      if (t.dueAt < from || t.dueAt > to) return false;
    }
    return true;
  }, [agent, tab, taskType, range]);

  // Same Booking guard as the Leads page and the dashboard: booking a lead
  // auto-generates an invoice from its deal value, so a real value is required.
  const handleStatusChange = (leadId: string, status: LeadStatus) => {
    if (status === "Booking Done" || status === "Booking Approved" || status === "Booked") {
      const input = prompt("Enter the real deal value for this booking (INR):");
      const dealValue = input ? parseFloat(input.replace(/[^0-9.]/g, "")) : NaN;
      if (!input || isNaN(dealValue) || dealValue <= 0) {
        alert("A valid deal value is required to mark a lead as Booked.");
        return;
      }
      updateLeadStatus(leadId, status, dealValue);
    } else {
      updateLeadStatus(leadId, status);
    }
  };

  const isSalesMember = currentUser?.role_type === "Member" && currentUser?.role !== "ADMIN";
  if (currentUser && isSalesMember) {
    return (
      <div className="bg-white rounded-2xl shadow-md p-8 text-center text-sm text-slate-500">
        This page is available to Admins and Managers only.{" "}
        <Link href="/crm/dashboard" className="text-blue-600 font-bold hover:underline">Back to Dashboard</Link>
      </div>
    );
  }

  const subtitle = [agent || "No team member selected", tab === "pending" ? "Pending Task" : null, taskType !== "All" ? taskType : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <Link href="/crm/dashboard" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#0B1E6E]">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>
        <DateRangePicker value={range} onChange={setRange} heading="Filter tasks by due date" />
      </div>

      <SalesPendingTasksTable
        title="All Task"
        subtitle={subtitle}
        leads={leads}
        followupCalls={followupCalls}
        taskFilter={taskFilter}
        onViewLead={(leadId) => setDrawerLead(leads.find(l => l.id === leadId) || null)}
        onStatusChange={handleStatusChange}
        isLoading={isDataLoading}
      />

      <LeadDetailDrawer
        lead={drawerLead ? leads.find(l => l.id === drawerLead.id) || drawerLead : null}
        isOpen={drawerLead !== null}
        onClose={() => setDrawerLead(null)}
        onUpdateStatus={handleStatusChange}
      />
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
