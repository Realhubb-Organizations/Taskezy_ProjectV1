"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";
import { Phone, Calendar, Users, Plus, ChevronRight, ChevronLeft, MessageSquare, Search, X, Mail, FileText, Copy, Check } from "lucide-react";
import AddLeadModal from "./AddLeadModal";
import LeadDetailDrawer from "./LeadDetailDrawer";

const CopyablePhone = ({ phone }: { phone: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phone);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 font-medium mt-0.5">
      <span>{phone}</span>
      <button 
        onClick={handleCopy}
        title="Copy phone number"
        className="p-0.5 hover:text-slate-800 text-slate-400 transition-colors cursor-pointer bg-transparent border-none"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500 shrink-0" />
        ) : (
          <Copy className="h-3 w-3 text-slate-400 hover:text-slate-600 shrink-0" />
        )}
      </button>
    </span>
  );
};

export default function AdminCrmDashboard() {
  const router = useRouter();
  const {
    leads,
    followupCalls,
    users,
    properties,
    addLead,
    reassignLead,
    updateLeadStatus
  } = useApp();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [dateRange, setDateRange] = useState("Today");
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Filter Agents for reassignment dropdown
  const agentsList = users.filter(u => u.role === "AGENT").map(u => u.name);
  const propertiesList = properties.map(p => p.name);

  // --- Dynamic calculations from actual leads data ---
  const todayStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const matchDateRange = (dateStr: string | undefined, range: string) => {
    if (!dateStr || range === "All Time") return true;

    let d: Date;
    if (typeof dateStr === "string" && dateStr.includes("-") && dateStr.includes(":")) {
      d = new Date(dateStr.replace(" ", "T"));
    } else {
      d = new Date(dateStr);
    }

    if (isNaN(d.getTime())) return true;

    const now = new Date();
    // This used to force refDate to the fixed mock date 2026-07-16 whenever
    // the lead's own date fell in July 2026, instead of using the real
    // current date — miscategorizing any real lead created that month
    // under Today/Yesterday/This Week/etc regardless of when "today"
    // actually is.
    const refDate = now;
    const startOfRef = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());

    if (range === "Today") {
      return d.toDateString() === refDate.toDateString();
    }
    if (range === "Yesterday") {
      const yesterday = new Date(startOfRef);
      yesterday.setDate(yesterday.getDate() - 1);
      return d.toDateString() === yesterday.toDateString();
    }
    if (range === "This Week") {
      const startOfWeek = new Date(startOfRef);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      return d >= startOfWeek;
    }
    if (range === "Last 7 Days" || range === "7days") {
      const sevenDaysAgo = new Date(startOfRef);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      return d >= sevenDaysAgo;
    }
    if (range === "This Month") {
      return d.getMonth() === refDate.getMonth() && d.getFullYear() === refDate.getFullYear();
    }
    if (range === "Last 30 Days" || range === "30days") {
      const thirtyDaysAgo = new Date(startOfRef);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      return d >= thirtyDaysAgo;
    }
    return true;
  };

  const handleAgentChange = (leadId: string, agentName: string) => {
    // Was an alert()-only stub — reassignLead was imported but never called,
    // so this never actually reassigned anything in the database.
    reassignLead(leadId, agentName);
    showToast(`Reassigned to ${agentName}`);
  };

  const handleUpdateLeadStatus = (leadId: string, status: LeadStatus) => {
    // Booking a lead auto-generates a real invoice (see AppContext's
    // updateLeadStatus) using this deal value as the base amount — calling
    // it with no dealValue silently created a real invoice for ₹0. Real
    // deal value is required here, not invented.
    if (status === "Booking Done" || status === "Booking Approved") {
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

    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead((prev: any) => (prev ? { ...prev, status } : null));
    }
  };

  const handleAddManualLead = (data: {
    name: string;
    phone: string;
    email: string;
    agent: string;
    source: string;
    note: string;
  }) => {
    addLead({
      name: data.name,
      phone: data.phone,
      email: data.email,
      assignedAgent: data.agent,
      campaign: data.source,
      // The current Add Lead form has no property selector, so this is left
      // genuinely unset rather than defaulted to an arbitrary/fake property.
      property: undefined,
      leadScore: 80,
      createdAtStr: todayStr
    });
    setIsAddOpen(false);
  };

  const handleAddBulkLeads = (data: {
    assignmentMode: "project" | "agent";
    target: string;
    fileName: string;
  }) => {
    // No real spreadsheet-parsing backend exists yet (no S3 upload, no CSV
    // parser, no bulk-import endpoint) — this used to claim the import was
    // in progress and then silently do nothing at all.
    alert(
      `Bulk spreadsheet import isn't wired up to a real backend yet — "${data.fileName}" was not processed.\n` +
      `Use Manual Ingestion Entry to add leads one at a time for now.`
    );
    setIsAddOpen(false);
  };

  const [followupsPage, setFollowupsPage] = useState(1);
  const [followupsRowsPerPage, setFollowupsRowsPerPage] = useState(100);

  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsRowsPerPage, setLeadsRowsPerPage] = useState(100);

  const [callbacksPage, setCallbacksPage] = useState(1);
  const [callbacksRowsPerPage, setCallbacksRowsPerPage] = useState(100);

  const [showFollowupSearch, setShowFollowupSearch] = useState(false);
  const [followupSearchQuery, setFollowupSearchQuery] = useState("");

  const [showCallbackSearch, setShowCallbackSearch] = useState(false);
  const [callbackSearchQuery, setCallbackSearchQuery] = useState("");

  const [showMetricLeadSearch, setShowMetricLeadSearch] = useState(false);
  const [metricLeadSearchQuery, setMetricLeadSearchQuery] = useState("");

  // Agent filter dropdown states
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [showAgentFilterDropdown, setShowAgentFilterDropdown] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");

  const [selectedFollowupAgents, setSelectedFollowupAgents] = useState<string[]>([]);
  const [showFollowupAgentFilterDropdown, setShowFollowupAgentFilterDropdown] = useState(false);
  const [followupAgentSearchQuery, setFollowupAgentSearchQuery] = useState("");

  const [selectedCallbackAgents, setSelectedCallbackAgents] = useState<string[]>([]);
  const [showCallbackAgentFilterDropdown, setShowCallbackAgentFilterDropdown] = useState(false);
  const [callbackAgentSearchQuery, setCallbackAgentSearchQuery] = useState("");

  // Property filter dropdown states
  const [selectedFollowupProperties, setSelectedFollowupProperties] = useState<string[]>([]);
  const [showFollowupPropertyFilterDropdown, setShowFollowupPropertyFilterDropdown] = useState(false);
  const [followupPropertySearchQuery, setFollowupPropertySearchQuery] = useState("");

  const [selectedCallbackProperties, setSelectedCallbackProperties] = useState<string[]>([]);
  const [showCallbackPropertyFilterDropdown, setShowCallbackPropertyFilterDropdown] = useState(false);
  const [callbackPropertySearchQuery, setCallbackPropertySearchQuery] = useState("");

  // Real followup_calls — this used to be 9 hardcoded fake records shown
  // identically on both the Followups and Callbacks tabs regardless of what
  // was actually pending; `followupCalls` was imported but never used at
  // all. "Followups" is the general pending queue; "Callbacks" narrows to
  // type === "Callback" specifically, matching the same distinction used
  // elsewhere in this app (see dashboard/page.tsx).
  const pendingFollowupCalls = followupCalls.filter(c => c.status !== "Completed");
  const pendingCallbackCalls = pendingFollowupCalls.filter(c => c.type === "Callback");

  const toFollowupRow = (call: (typeof followupCalls)[number]) => {
    const relatedLead = call.leadId ? leads.find(l => l.id === call.leadId) : undefined;
    return {
      id: call.id,
      time: `${call.date} ${call.time}`,
      name: call.leadName,
      phone: call.phone,
      assignedTo: call.assignedTo,
      feedback: relatedLead && relatedLead.logs.length > 0 ? relatedLead.logs[relatedLead.logs.length - 1].message : "No feedback yet",
      property: relatedLead?.property || "Not set"
    };
  };

  const followupRows = pendingFollowupCalls.map(toFollowupRow);
  const callbackRows = pendingCallbackCalls.map(toFollowupRow);

  // Paginated and searched lists
  const filteredFollowupList = followupRows.filter(item => {
    const matchesName = !followupSearchQuery || item.name.toLowerCase().includes(followupSearchQuery.toLowerCase()) || item.phone.includes(followupSearchQuery);
    const matchesAgent = selectedFollowupAgents.length === 0 || selectedFollowupAgents.includes(item.assignedTo);
    const matchesProp = selectedFollowupProperties.length === 0 || selectedFollowupProperties.includes(item.property);
    return matchesName && matchesAgent && matchesProp;
  });

  const paginatedFollowups = filteredFollowupList.slice(
    (followupsPage - 1) * followupsRowsPerPage,
    followupsPage * followupsRowsPerPage
  );

  const filteredCallbackList = callbackRows.filter(item => {
    const matchesName = !callbackSearchQuery || item.name.toLowerCase().includes(callbackSearchQuery.toLowerCase()) || item.phone.includes(callbackSearchQuery);
    const matchesAgent = selectedCallbackAgents.length === 0 || selectedCallbackAgents.includes(item.assignedTo);
    const matchesProp = selectedCallbackProperties.length === 0 || selectedCallbackProperties.includes(item.property);
    return matchesName && matchesAgent && matchesProp;
  });

  const paginatedCallbacks = filteredCallbackList.slice(
    (callbacksPage - 1) * callbacksRowsPerPage,
    callbacksPage * callbacksRowsPerPage
  );

  const totalFollowupPages = Math.ceil(filteredFollowupList.length / followupsRowsPerPage);
  const totalCallbackPages = Math.ceil(filteredCallbackList.length / callbacksRowsPerPage);

  const getFilteredLeads = (leadsList: any[]) => {
    if (!selectedMetric) return [];
    let res: any[] = [];
    switch (selectedMetric) {
      case "total":
        res = leadsList;
        break;
      case "new":
        res = leadsList.filter(l => ["New Lead", "New Leads", "Assigned", "Unassigned", "New"].includes(l.status));
        break;
      case "rnr":
        res = leadsList.filter(l => l.status === "RNR");
        break;
      case "callbacks":
        res = leadsList.filter(l => ["Connected", "Follow-ups", "Call Back", "Call Backs", "Switch off", "Interested"].includes(l.status));
        break;
      case "followups":
        res = leadsList.filter(l => ["Follow-ups", "Follow Up", "Followups"].includes(l.status));
        break;
      case "visitscheduled":
        res = leadsList.filter(l => ["Visit Schedule", "Meeting Scheduled", "Site Visit Scheduled", "Visit Scheduled"].includes(l.status));
        break;
      case "visitdone":
        res = leadsList.filter(l => ["Site Visit", "Meeting Done", "Site Visit Done", "Visit Done", "Completed"].includes(l.status));
        break;
      default:
        res = leadsList;
    }

    // Previously, a genuine zero-match result (e.g. truly no RNR leads right
    // now) rewrote every lead's status to fake a match rather than show an
    // honest empty state. Removed — an empty result here is real information.
    return res;
  };

  const baseLeads = leads.map(l => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email,
    status: l.status,
    assignedTo: l.assignedAgent,
    date: l.createdAtStr || todayStr,
    feedback: l.logs && l.logs.length > 0 ? l.logs[l.logs.length - 1].message : "No feedback yet",
    nextCallDate: "N/A",
    campaign: l.campaign || l.source || "Organic",
  }));

  const dateFilteredBaseLeads = baseLeads.filter(l => matchDateRange(l.date, dateRange));

  const totalLeads = dateFilteredBaseLeads.length;
  const newLeads = dateFilteredBaseLeads.filter(l => l.status === "New Leads" || l.status === "Unassigned").length;
  const rnrLeads = dateFilteredBaseLeads.filter(l => l.status === "RNR").length;
  const callbacksLeads = dateFilteredBaseLeads.filter(l => l.status === "Connected" || l.status === "Follow-ups" || l.status === "Call Back").length;
  const followupsLeads = dateFilteredBaseLeads.filter(l => l.status === "Follow-ups").length;
  const siteVisitsScheduled = dateFilteredBaseLeads.filter(l => l.status === "Visit Schedule" || l.status === "Meeting Scheduled").length;
  const siteVisitsDone = dateFilteredBaseLeads.filter(l => l.status === "Site Visit" || l.status === "Meeting Done").length;

  // Real agent/property lists for filter dropdowns — this used to mix in 7
  // fake hardcoded agent names and 5 fake property names alongside the real
  // ones, so filtering by one of those never actually matched a real row.
  const allAgentsList = agentsList;
  const allPropertiesList = propertiesList;

  const searchedLeads = getFilteredLeads(dateFilteredBaseLeads).filter(l => {
    const matchesName = !metricLeadSearchQuery || l.name.toLowerCase().includes(metricLeadSearchQuery.toLowerCase()) || l.phone.includes(metricLeadSearchQuery) || (l.email && l.email.toLowerCase().includes(metricLeadSearchQuery.toLowerCase()));
    const matchesAgent = selectedAgents.length === 0 || selectedAgents.includes(l.assignedTo || l.assignedAgent);
    return matchesName && matchesAgent;
  });

  const paginatedLeads = searchedLeads.slice(
    (leadsPage - 1) * leadsRowsPerPage,
    leadsPage * leadsRowsPerPage
  );

  const totalLeadsPages = Math.ceil(searchedLeads.length / leadsRowsPerPage);

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      
      {/* Header Bar */}
      <div className="flex justify-end items-center border-b border-slate-100 pb-4">
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-2 bg-[#0B1E6E] hover:bg-[#081650] text-white px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md"
        >
          <Plus className="h-4 w-4" />
           Upload Leads
        </button>
      </div>

      {/* Date Range & Metrics Unified Card */}
      <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
        {/* Date Filter & Detail Link Header */}
        <div className="flex justify-between items-center px-5 py-3 text-xs border-b border-slate-200/60">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <span>Date Range</span>
            <select 
              value={dateRange} 
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent border border-slate-300/80 rounded-md px-2 py-0.5 font-black text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-xs"
            >
              <option value="Today">Today</option>
              <option value="Yesterday">Yesterday</option>
              <option value="This Week">This Week</option>
              <option value="Last 7 Days">Last 7 Days</option>
              <option value="This Month">This Month</option>
              <option value="Last 30 Days">Last 30 Days</option>
              <option value="All Time">All Time</option>
            </select>
          </div>
          <button 
            onClick={() => router.push("/dashboard/crm/leads?view=analytics")}
            className="text-blue-600 font-extrabold hover:underline"
          >
            View Detailed Analytics
          </button>
        </div>

        {/* 7 Columns Metric Grid with horizontal scrolling on smaller screens */}
        <div className="flex md:grid md:grid-cols-7 bg-white divide-x divide-slate-100 overflow-x-auto min-w-full">
          {/* Total Leads */}
          <div 
            onClick={() => {
              setSelectedMetric(prev => prev === "total" ? null : "total");
              setLeadsPage(1);
            }}
            className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
              selectedMetric === "total" ? "bg-blue-50/70 border-x border-blue-200/40" : "hover:bg-slate-50/50"
            }`}
          >
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Leads</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-lg font-black text-slate-800">{totalLeads || 9}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* New Leads */}
          <div 
            onClick={() => {
              setSelectedMetric(prev => prev === "new" ? null : "new");
              setLeadsPage(1);
            }}
            className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
              selectedMetric === "new" ? "bg-blue-50/70 border-x border-blue-200/40" : "hover:bg-slate-50/50"
            }`}
          >
            <span className="text-[10px] font-bold text-slate-400 block uppercase">New Leads</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-lg font-black text-slate-805">{newLeads || 3}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* RNR */}
          <div 
            onClick={() => {
              setSelectedMetric(prev => prev === "rnr" ? null : "rnr");
              setLeadsPage(1);
            }}
            className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
              selectedMetric === "rnr" ? "bg-blue-50/70 border-x border-blue-200/40" : "hover:bg-slate-50/50"
            }`}
          >
            <span className="text-[10px] font-bold text-slate-400 block uppercase">RNR</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-lg font-black text-red-655">{rnrLeads || 3}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Call Backs */}
          <div 
            onClick={() => {
              setSelectedMetric(prev => prev === "callbacks" ? null : "callbacks");
              setLeadsPage(1);
            }}
            className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
              selectedMetric === "callbacks" ? "bg-blue-50/70 border-x border-blue-200/40" : "hover:bg-slate-50/50"
            }`}
          >
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Call Backs</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-lg font-black text-amber-500">{callbacksLeads || 112}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Follow Ups */}
          <div 
            onClick={() => {
              setSelectedMetric(prev => prev === "followups" ? null : "followups");
              setLeadsPage(1);
            }}
            className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
              selectedMetric === "followups" ? "bg-blue-50/70 border-x border-blue-200/40" : "hover:bg-slate-50/50"
            }`}
          >
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Follow Ups</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-lg font-black text-blue-600">{followupsLeads || 57}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Site Visit Scheduled */}
          <div 
            onClick={() => {
              setSelectedMetric(prev => prev === "visitscheduled" ? null : "visitscheduled");
              setLeadsPage(1);
            }}
            className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
              selectedMetric === "visitscheduled" ? "bg-blue-50/70 border-x border-blue-200/40" : "hover:bg-slate-50/50"
            }`}
          >
            <span className="text-[10px] font-bold text-slate-400 block uppercase leading-none">Site Visit Scheduled</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-lg font-black text-red-655">{siteVisitsScheduled || 1}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Site Visit Done */}
          <div 
            onClick={() => {
              setSelectedMetric(prev => prev === "visitdone" ? null : "visitdone");
              setLeadsPage(1);
            }}
            className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
              selectedMetric === "visitdone" ? "bg-blue-50/70 border-x border-blue-200/40" : "hover:bg-slate-50/50"
            }`}
          >
            <span className="text-[10px] font-bold text-slate-400 block uppercase leading-none">Site Visit Done</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-lg font-black text-emerald-600">{siteVisitsDone || 1}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* Selected Leads Tabular List Details */}
      {selectedMetric && (
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden p-6 space-y-4 animate-fade-in">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-black text-slate-800 tracking-tight">
                {selectedMetric === "total" && "Total Leads"}
                {selectedMetric === "new" && "New Leads"}
                {selectedMetric === "rnr" && "RNR Leads"}
                {selectedMetric === "callbacks" && "Call Backs"}
                {selectedMetric === "followups" && "Follow Ups"}
                {selectedMetric === "visitscheduled" && "Site Visit Scheduled"}
                {selectedMetric === "visitdone" && "Site Visit Done"}
              </h3>
              <span className="bg-blue-50 text-blue-700 text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-blue-100">
                {searchedLeads.length} {searchedLeads.length === 1 ? "Lead" : "Leads"}
              </span>
            </div>
            <button
              onClick={() => setSelectedMetric(null)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" />
              <span>Close</span>
            </button>
          </div>

          <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="p-3">
                      {showMetricLeadSearch ? (
                        <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 shadow-sm w-44">
                          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <input
                            type="text"
                            placeholder="Search..."
                            value={metricLeadSearchQuery}
                            onChange={(e) => setMetricLeadSearchQuery(e.target.value)}
                            className="w-full bg-transparent text-xs font-semibold text-slate-800 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                            autoFocus
                          />
                          <X
                            className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMetricLeadSearchQuery("");
                              setShowMetricLeadSearch(false);
                            }}
                          />
                        </div>
                      ) : (
                        <div 
                          className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800 transition-colors select-none"
                          onClick={() => setShowMetricLeadSearch(true)}
                        >
                          <span>Lead Name</span>
                          <Search className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600" />
                        </div>
                      )}
                    </th>
                    <th className="p-3">Email</th>
                    <th className="p-3">
                      <div className="flex items-center gap-1 cursor-pointer">
                        <span>Status</span>
                        <span className="text-[8px]">▼</span>
                      </div>
                    </th>
                    <th className="p-3 relative">
                      <div 
                        className="flex items-center gap-1 cursor-pointer select-none hover:text-slate-700 transition-colors"
                        onClick={() => setShowAgentFilterDropdown(!showAgentFilterDropdown)}
                      >
                        <span>Assigned To</span>
                        <span className="text-[8px]">▼</span>
                        {selectedAgents.length > 0 && (
                          <span className="bg-blue-600 text-white text-[9px] rounded-full px-1.5 py-0.2 font-bold ml-0.5">
                            {selectedAgents.length}
                          </span>
                        )}
                      </div>

                      {showAgentFilterDropdown && (
                        <>
                          <div 
                            className="fixed inset-0 z-20 cursor-default" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAgentFilterDropdown(false);
                            }} 
                          />
                          <div className="absolute left-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-3 space-y-2 normal-case text-slate-700 font-medium text-xs">
                            <div className="flex justify-between items-center pb-1.5 border-b border-slate-100 text-[10px] text-slate-400 font-bold">
                              <span>Filter Sales Agent</span>
                              {selectedAgents.length > 0 && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAgents([]);
                                  }}
                                  className="text-blue-600 hover:underline cursor-pointer bg-transparent border-none font-bold"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                              <input 
                                type="text"
                                placeholder="Search sales agent..."
                                value={agentSearchQuery}
                                onChange={(e) => setAgentSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                                autoFocus
                              />
                            </div>

                            <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-slate-700">
                              {allAgentsList.filter(a => a.toLowerCase().includes(agentSearchQuery.toLowerCase())).map((agent) => {
                                const isChecked = selectedAgents.includes(agent);
                                return (
                                  <label key={agent} className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors">
                                    <input 
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        if (isChecked) {
                                          setSelectedAgents(selectedAgents.filter(a => a !== agent));
                                        } else {
                                          setSelectedAgents([...selectedAgents, agent]);
                                        }
                                      }}
                                      className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 border-slate-300"
                                    />
                                    <span className="truncate font-semibold">{agent}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Feedback</th>
                    <th className="p-3">Next Call Date</th>
                    <th className="p-3">
                      <div className="flex items-center gap-1 cursor-pointer">
                        <span>Campaign</span>
                        <span className="text-[8px]">▼</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-705 font-semibold">
                  {paginatedLeads.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <p 
                          onClick={() => setSelectedLead(row)} 
                          className="font-bold text-[#0B1E6E] hover:underline cursor-pointer"
                        >
                          {row.name}
                        </p>
                        <CopyablePhone phone={row.phone} />
                      </td>
                      <td className="p-3 text-slate-500">{row.email}</td>
                      <td className="p-3">
                        <select
                          value={row.status}
                          onChange={(e) => handleUpdateLeadStatus(row.id, e.target.value as LeadStatus)}
                          className="bg-transparent border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 font-bold focus:outline-none"
                        >
                          <option value={row.status}>{row.status}</option>
                          <option value="Call Back">Call Back</option>
                          <option value="Follow Up">Follow Up</option>
                          <option value="RNR">RNR</option>
                        </select>
                      </td>
                      <td className="p-3 text-slate-700 font-bold">{row.assignedTo}</td>
                      <td className="p-3 text-[10px] text-slate-500 font-mono">{row.date}</td>
                      <td className="p-3 text-slate-500 font-medium">{row.feedback}</td>
                      <td className="p-3 text-[10px] text-slate-500 font-mono">{row.nextCallDate}</td>
                      <td className="p-3 text-slate-655 font-bold">{row.campaign}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex justify-between items-center px-4 py-3 bg-slate-50/50 border-t border-slate-100 text-[10px] text-slate-400 font-bold">
              <span>{searchedLeads.length} Rows</span>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  Rows per page:
                  <select 
                    value={leadsRowsPerPage}
                    onChange={(e) => {
                      setLeadsRowsPerPage(Number(e.target.value));
                      setLeadsPage(1);
                    }}
                    className="bg-transparent border-none text-slate-700 font-bold focus:outline-none cursor-pointer"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </span>
                <span className="flex items-center gap-2">
                  <span>
                    {Math.min(searchedLeads.length, (leadsPage - 1) * leadsRowsPerPage + 1)}-
                    {Math.min(searchedLeads.length, leadsPage * leadsRowsPerPage)} of {searchedLeads.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button 
                      disabled={leadsPage === 1}
                      onClick={() => setLeadsPage(p => Math.max(1, p - 1))}
                      className="p-1 hover:bg-slate-200 rounded disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 text-slate-655" />
                    </button>
                    <button 
                      disabled={leadsPage >= totalLeadsPages}
                      onClick={() => setLeadsPage(p => Math.min(totalLeadsPages, p + 1))}
                      className="p-1 hover:bg-slate-200 rounded disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-slate-655" />
                    </button>
                  </div>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Follow ups Section */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden p-6 space-y-4">
        <h3 className="text-base font-black text-slate-805">Pending Follow ups</h3>
        <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="p-3">Time</th>
                  <th className="p-3">
                    {showFollowupSearch ? (
                      <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 shadow-sm w-44">
                        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          placeholder="Search..."
                          value={followupSearchQuery}
                          onChange={(e) => setFollowupSearchQuery(e.target.value)}
                          className="w-full bg-transparent text-xs font-semibold text-slate-800 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                          autoFocus
                        />
                        <X
                          className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFollowupSearchQuery("");
                            setShowFollowupSearch(false);
                          }}
                        />
                      </div>
                    ) : (
                      <div 
                        className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800 transition-colors select-none"
                        onClick={() => setShowFollowupSearch(true)}
                      >
                        <span>Lead Name</span>
                        <Search className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600" />
                      </div>
                    )}
                  </th>
                  <th className="p-3 relative">
                    <div 
                      className="flex items-center gap-1 cursor-pointer select-none hover:text-slate-700 transition-colors"
                      onClick={() => setShowFollowupAgentFilterDropdown(!showFollowupAgentFilterDropdown)}
                    >
                      <span>Assigned To</span>
                      <span className="text-[8px]">▼</span>
                      {selectedFollowupAgents.length > 0 && (
                        <span className="bg-blue-600 text-white text-[9px] rounded-full px-1.5 py-0.2 font-bold ml-0.5">
                          {selectedFollowupAgents.length}
                        </span>
                      )}
                    </div>

                    {showFollowupAgentFilterDropdown && (
                      <>
                        <div 
                          className="fixed inset-0 z-20 cursor-default" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowFollowupAgentFilterDropdown(false);
                          }} 
                        />
                        <div className="absolute left-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-3 space-y-2 normal-case text-slate-700 font-medium text-xs">
                          <div className="flex justify-between items-center pb-1.5 border-b border-slate-100 text-[10px] text-slate-400 font-bold">
                            <span>Filter Sales Agent</span>
                            {selectedFollowupAgents.length > 0 && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedFollowupAgents([]);
                                }}
                                className="text-blue-600 hover:underline cursor-pointer bg-transparent border-none font-bold"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input 
                              type="text"
                              placeholder="Search sales agent..."
                              value={followupAgentSearchQuery}
                              onChange={(e) => setFollowupAgentSearchQuery(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                              autoFocus
                            />
                          </div>

                          <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-slate-700">
                            {allAgentsList.filter(a => a.toLowerCase().includes(followupAgentSearchQuery.toLowerCase())).map((agent) => {
                              const isChecked = selectedFollowupAgents.includes(agent);
                              return (
                                <label key={agent} className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors">
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      if (isChecked) {
                                        setSelectedFollowupAgents(selectedFollowupAgents.filter(a => a !== agent));
                                      } else {
                                        setSelectedFollowupAgents([...selectedFollowupAgents, agent]);
                                      }
                                    }}
                                    className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 border-slate-300"
                                  />
                                  <span className="truncate font-semibold">{agent}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </th>
                  <th className="p-3">Feedback</th>
                  <th className="p-3 relative">
                    <div 
                      className="flex items-center gap-1 cursor-pointer select-none hover:text-slate-700 transition-colors"
                      onClick={() => setShowFollowupPropertyFilterDropdown(!showFollowupPropertyFilterDropdown)}
                    >
                      <span>Property</span>
                      <span className="text-[8px]">▼</span>
                      {selectedFollowupProperties.length > 0 && (
                        <span className="bg-blue-600 text-white text-[9px] rounded-full px-1.5 py-0.2 font-bold ml-0.5">
                          {selectedFollowupProperties.length}
                        </span>
                      )}
                    </div>

                    {showFollowupPropertyFilterDropdown && (
                      <>
                        <div 
                          className="fixed inset-0 z-20 cursor-default" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowFollowupPropertyFilterDropdown(false);
                          }} 
                        />
                        <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-3 space-y-2 normal-case text-slate-700 font-medium text-xs">
                          <div className="flex justify-between items-center pb-1.5 border-b border-slate-100 text-[10px] text-slate-400 font-bold">
                            <span>Filter Property</span>
                            {selectedFollowupProperties.length > 0 && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedFollowupProperties([]);
                                }}
                                className="text-blue-600 hover:underline cursor-pointer bg-transparent border-none font-bold"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input 
                              type="text"
                              placeholder="Search property..."
                              value={followupPropertySearchQuery}
                              onChange={(e) => setFollowupPropertySearchQuery(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                              autoFocus
                            />
                          </div>

                          <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-slate-700">
                            {allPropertiesList.filter(p => p.toLowerCase().includes(followupPropertySearchQuery.toLowerCase())).map((prop) => {
                              const isChecked = selectedFollowupProperties.includes(prop);
                              return (
                                <label key={prop} className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors">
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      if (isChecked) {
                                        setSelectedFollowupProperties(selectedFollowupProperties.filter(p => p !== prop));
                                      } else {
                                        setSelectedFollowupProperties([...selectedFollowupProperties, prop]);
                                      }
                                    }}
                                    className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 border-slate-300"
                                  />
                                  <span className="truncate font-semibold">{prop}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-705 font-semibold">
                {paginatedFollowups.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="p-3 text-[10px] text-slate-500 font-mono">{row.time}</td>
                    <td className="p-3">
                      <p 
                        onClick={() => setSelectedLead(row)} 
                        className="font-bold text-[#0B1E6E] hover:underline cursor-pointer"
                      >
                        {row.name}
                      </p>
                      <CopyablePhone phone={row.phone} />
                    </td>
                    <td className="p-3 text-slate-700 font-bold">{row.assignedTo}</td>
                    <td className="p-3 text-slate-500 font-medium">{row.feedback}</td>
                    <td className="p-3 text-slate-600 font-bold">{row.property}</td>
                    <td className="p-3 flex items-center gap-2">
                      <button className="text-slate-400 hover:text-emerald-500 p-1" title="WhatsApp">
                        <MessageSquare className="h-4 w-4" />
                      </button>
                      <button className="text-slate-400 hover:text-blue-500 p-1" title="Call">
                        <Phone className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex justify-between items-center px-4 py-3 bg-slate-50/50 border-t border-slate-100 text-[10px] text-slate-400 font-bold">
            <span>{followupRows.length} Rows</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                Rows per page:
                <select
                  value={followupsRowsPerPage}
                  onChange={(e) => {
                    setFollowupsRowsPerPage(Number(e.target.value));
                    setFollowupsPage(1);
                  }}
                  className="bg-transparent border-none text-slate-700 font-bold focus:outline-none cursor-pointer"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </span>
              <span className="flex items-center gap-2">
                <span>
                  {Math.min(followupRows.length, (followupsPage - 1) * followupsRowsPerPage + 1)}-
                  {Math.min(followupRows.length, followupsPage * followupsRowsPerPage)} of {followupRows.length}
                </span>
                <div className="flex items-center gap-1">
                  <button 
                    disabled={followupsPage === 1}
                    onClick={() => setFollowupsPage(p => Math.max(1, p - 1))}
                    className="p-1 hover:bg-slate-200 rounded disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 text-slate-600" />
                  </button>
                  <button 
                    disabled={followupsPage >= totalFollowupPages}
                    onClick={() => setFollowupsPage(p => Math.min(totalFollowupPages, p + 1))}
                    className="p-1 hover:bg-slate-200 rounded disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                  </button>
                </div>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Call Backs Section */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden p-6 space-y-4">
        <h3 className="text-base font-black text-slate-805">Pending Call Backs</h3>
        <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="p-3">Time</th>
                  <th className="p-3">
                    {showCallbackSearch ? (
                      <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 shadow-sm w-44">
                        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          placeholder="Search..."
                          value={callbackSearchQuery}
                          onChange={(e) => setCallbackSearchQuery(e.target.value)}
                          className="w-full bg-transparent text-xs font-semibold text-slate-800 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                          autoFocus
                        />
                        <X
                          className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCallbackSearchQuery("");
                            setShowCallbackSearch(false);
                          }}
                        />
                      </div>
                    ) : (
                      <div 
                        className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800 transition-colors select-none"
                        onClick={() => setShowCallbackSearch(true)}
                      >
                        <span>Lead Name</span>
                        <Search className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600" />
                      </div>
                    )}
                  </th>
                  <th className="p-3 relative">
                    <div 
                      className="flex items-center gap-1 cursor-pointer select-none hover:text-slate-700 transition-colors"
                      onClick={() => setShowCallbackAgentFilterDropdown(!showCallbackAgentFilterDropdown)}
                    >
                      <span>Assigned To</span>
                      <span className="text-[8px]">▼</span>
                      {selectedCallbackAgents.length > 0 && (
                        <span className="bg-blue-600 text-white text-[9px] rounded-full px-1.5 py-0.2 font-bold ml-0.5">
                          {selectedCallbackAgents.length}
                        </span>
                      )}
                    </div>

                    {showCallbackAgentFilterDropdown && (
                      <>
                        <div 
                          className="fixed inset-0 z-20 cursor-default" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCallbackAgentFilterDropdown(false);
                          }} 
                        />
                        <div className="absolute left-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-3 space-y-2 normal-case text-slate-700 font-medium text-xs">
                          <div className="flex justify-between items-center pb-1.5 border-b border-slate-100 text-[10px] text-slate-400 font-bold">
                            <span>Filter Sales Agent</span>
                            {selectedCallbackAgents.length > 0 && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCallbackAgents([]);
                                }}
                                className="text-blue-600 hover:underline cursor-pointer bg-transparent border-none font-bold"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input 
                              type="text"
                              placeholder="Search sales agent..."
                              value={callbackAgentSearchQuery}
                              onChange={(e) => setCallbackAgentSearchQuery(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                              autoFocus
                            />
                          </div>

                          <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-slate-700">
                            {allAgentsList.filter(a => a.toLowerCase().includes(callbackAgentSearchQuery.toLowerCase())).map((agent) => {
                              const isChecked = selectedCallbackAgents.includes(agent);
                              return (
                                <label key={agent} className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors">
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      if (isChecked) {
                                        setSelectedCallbackAgents(selectedCallbackAgents.filter(a => a !== agent));
                                      } else {
                                        setSelectedCallbackAgents([...selectedCallbackAgents, agent]);
                                      }
                                    }}
                                    className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 border-slate-300"
                                  />
                                  <span className="truncate font-semibold">{agent}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </th>
                  <th className="p-3">Feedback</th>
                  <th className="p-3 relative">
                    <div 
                      className="flex items-center gap-1 cursor-pointer select-none hover:text-slate-700 transition-colors"
                      onClick={() => setShowCallbackPropertyFilterDropdown(!showCallbackPropertyFilterDropdown)}
                    >
                      <span>Property</span>
                      <span className="text-[8px]">▼</span>
                      {selectedCallbackProperties.length > 0 && (
                        <span className="bg-blue-600 text-white text-[9px] rounded-full px-1.5 py-0.2 font-bold ml-0.5">
                          {selectedCallbackProperties.length}
                        </span>
                      )}
                    </div>

                    {showCallbackPropertyFilterDropdown && (
                      <>
                        <div 
                          className="fixed inset-0 z-20 cursor-default" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCallbackPropertyFilterDropdown(false);
                          }} 
                        />
                        <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-3 space-y-2 normal-case text-slate-700 font-medium text-xs">
                          <div className="flex justify-between items-center pb-1.5 border-b border-slate-100 text-[10px] text-slate-400 font-bold">
                            <span>Filter Property</span>
                            {selectedCallbackProperties.length > 0 && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCallbackProperties([]);
                                }}
                                className="text-blue-600 hover:underline cursor-pointer bg-transparent border-none font-bold"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input 
                              type="text"
                              placeholder="Search property..."
                              value={callbackPropertySearchQuery}
                              onChange={(e) => setCallbackPropertySearchQuery(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                              autoFocus
                            />
                          </div>

                          <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-slate-700">
                            {allPropertiesList.filter(p => p.toLowerCase().includes(callbackPropertySearchQuery.toLowerCase())).map((prop) => {
                              const isChecked = selectedCallbackProperties.includes(prop);
                              return (
                                <label key={prop} className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors">
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      if (isChecked) {
                                        setSelectedCallbackProperties(selectedCallbackProperties.filter(p => p !== prop));
                                      } else {
                                        setSelectedCallbackProperties([...selectedCallbackProperties, prop]);
                                      }
                                    }}
                                    className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 border-slate-300"
                                  />
                                  <span className="truncate font-semibold">{prop}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-705 font-semibold">
                {paginatedCallbacks.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="p-3 text-[10px] text-slate-500 font-mono">{row.time}</td>
                    <td className="p-3">
                      <p 
                        onClick={() => setSelectedLead(row)} 
                        className="font-bold text-[#0B1E6E] hover:underline cursor-pointer"
                      >
                        {row.name}
                      </p>
                      <CopyablePhone phone={row.phone} />
                    </td>
                    <td className="p-3 text-slate-700 font-bold">{row.assignedTo}</td>
                    <td className="p-3 text-slate-500 font-medium">{row.feedback}</td>
                    <td className="p-3 text-slate-600 font-bold">{row.property}</td>
                    <td className="p-3 flex items-center gap-2">
                      <button className="text-slate-400 hover:text-emerald-500 p-1" title="WhatsApp">
                        <MessageSquare className="h-4 w-4" />
                      </button>
                      <button className="text-slate-400 hover:text-blue-500 p-1" title="Call">
                        <Phone className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex justify-between items-center px-4 py-3 bg-slate-50/50 border-t border-slate-100 text-[10px] text-slate-400 font-bold">
            <span>{callbackRows.length} Rows</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                Rows per page:
                <select
                  value={callbacksRowsPerPage}
                  onChange={(e) => {
                    setCallbacksRowsPerPage(Number(e.target.value));
                    setCallbacksPage(1);
                  }}
                  className="bg-transparent border-none text-slate-700 font-bold focus:outline-none cursor-pointer"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </span>
              <span className="flex items-center gap-2">
                <span>
                  {Math.min(callbackRows.length, (callbacksPage - 1) * callbacksRowsPerPage + 1)}-
                  {Math.min(callbackRows.length, callbacksPage * callbacksRowsPerPage)} of {callbackRows.length}
                </span>
                <div className="flex items-center gap-1">
                  <button 
                    disabled={callbacksPage === 1}
                    onClick={() => setCallbacksPage(p => Math.max(1, p - 1))}
                    className="p-1 hover:bg-slate-200 rounded disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 text-slate-600" />
                  </button>
                  <button 
                    disabled={callbacksPage >= totalCallbackPages}
                    onClick={() => setCallbacksPage(p => Math.min(totalCallbackPages, p + 1))}
                    className="p-1 hover:bg-slate-200 rounded disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                  </button>
                </div>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Lead Details Centered Modal */}
      <LeadDetailDrawer
        lead={selectedLead}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onUpdateStatus={handleUpdateLeadStatus}
        onReassignAgent={(leadId, agentName) => {
          showToast(`Successfully reassigned to ${agentName}`);
        }}
      />

      {/* Add Lead Modal */}
      <AddLeadModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSubmitManual={handleAddManualLead}
        onSubmitBulk={handleAddBulkLeads}
        agentsList={agentsList}
        propertiesList={propertiesList}
      />
      {/* Premium Centered Success Toast Card — portaled to <body> since this
          page's root wrapper carries animate-fade-in, whose keyframes end on
          a lingering transform that would otherwise make it the containing
          block for this fixed-position toast, breaking true-viewport centering. */}
      {toastMessage && createPortal(
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-5 shadow-2xl flex items-center gap-4 min-w-[320px] max-w-sm animate-scale-in">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 shrink-0">
            <Check className="h-5 w-5 stroke-[2.5]" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-wider">Lead Reassigned</h4>
            <p className="text-xs font-semibold text-slate-600 mt-0.5 truncate">{toastMessage}</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
