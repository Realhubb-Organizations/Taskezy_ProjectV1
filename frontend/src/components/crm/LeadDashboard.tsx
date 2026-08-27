import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";
import { Sliders, Sparkles, Plus, Check } from "lucide-react";
import TopMetricsCards from "./TopMetricsCards";
import LeadFilterBar from "./LeadFilterBar";
import LeadTable from "./LeadTable";
import AddLeadModal from "./AddLeadModal";
import LeadDetailDrawer from "./LeadDetailDrawer";

export default function LeadDashboard() {
  const {
    leads,
    followupCalls,
    addLead,
    updateLeadStatus,
    activeRole,
    deleteLead,
    editLead,
    currentUser,
    properties,
    calendarEvents,
    users
  } = useApp();

  const router = useRouter();
  const searchParams = useSearchParams();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<LeadStatus[]>([]);
  const [activeMetricFilter, setActiveMetricFilter] = useState("all");

  const triggerWhatsApp = (phone: string, name?: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(`Hello ${name || ""}, reaching out from TASKEZY CRM.`);
    window.open(`https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : "91" + cleanPhone}?text=${msg}`, "_blank");
  };

  const triggerCall = (phone: string, name?: string) => {
    window.open(`tel:${phone}`, "_self");
  };

  // Drawer / Modals State
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Deep-link support: notifications route here with ?openLead=<id> to jump straight to a lead
  useEffect(() => {
    const openLeadId = searchParams.get("openLead");
    if (openLeadId) {
      const found = leads.find(l => l.id === openLeadId);
      if (found) {
        setSelectedLead(found);
      }
      router.replace("/dashboard/crm");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Scoping check: is the current user a Sales Member?
  const isSalesMember = currentUser?.role_type === "Member" && currentUser?.role !== "ADMIN";

  // Data scoping based on role
  const scopedLeads = leads.filter(l => {
    if (isSalesMember) {
      return l.assignedAgent.toLowerCase() === currentUser?.name.toLowerCase();
    }
    return true;
  });

  // Unique status list gathered from the requested list of 20 statuses
  const availableStatuses: LeadStatus[] = [
    "Unassigned", "RNR", "Switch off", "Booked", "New Leads", 
    "Assigned", "Connected", "Interested", "Follow-ups", "Visit Schedule", 
    "Not Interested", "EOI Customers", "Invalid", "Low Budget", 
    "Meeting Scheduled", "Meeting Done", "Site Visit", "Completed", 
    "In Negotiation", "Dead"
  ];

  // Sub-account breakdown, grouped from real leads by ad-source keyword —
  // populates for real once the Meta/Google Ads integration starts writing
  // leads with source="Meta Ads"/"Google Ads". Empty until then, honestly.
  const groupBySourceKeyword = (pattern: RegExp) => {
    const counts = new Map<string, number>();
    scopedLeads.forEach(l => {
      const haystack = `${l.source || ""} ${l.campaign || ""}`;
      if (!pattern.test(haystack)) return;
      const key = l.campaign || l.source || "Unlabeled";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  };

  const metaSubAccounts = groupBySourceKeyword(/meta|facebook|instagram/i);
  const googleSubAccounts = groupBySourceKeyword(/google/i);

  const metaLeadsSum = metaSubAccounts.reduce((sum, a) => sum + a.count, 0);
  const googleLeadsSum = googleSubAccounts.reduce((sum, a) => sum + a.count, 0);
  const totalLeadsSum = scopedLeads.length;

  const isSameLocalDay = (isoStr: string | undefined, ref: Date) => {
    if (!isoStr) return false;
    const d = new Date(isoStr);
    return d.toDateString() === ref.toDateString();
  };

  const today = new Date();
  const leadsToday = scopedLeads.filter(l => isSameLocalDay(l.createdAtStr, today)).length;
  const visitsToday = scopedLeads.filter(l =>
    ["Visit Schedule", "Site Visit", "Site Visit Scheduled", "Meeting Scheduled"].includes(l.status)
  ).length;
  // Site-visit calendar events falling on this week's Saturday/Sunday.
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const weekendVisits = calendarEvents.filter(e => {
    if (e.type !== "SITE_VISIT") return false;
    const d = new Date(e.date);
    const isWeekendDay = d.getDay() === 0 || d.getDay() === 6;
    return isWeekendDay && d >= startOfWeek && d <= endOfWeek;
  }).length;
  const monthBookings = scopedLeads.filter(l => {
    if (!["Booked", "Booking Done", "Booking Approved"].includes(l.status)) return false;
    if (!l.createdAtStr) return false;
    const d = new Date(l.createdAtStr);
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).length;

  // Dynamic filter logic
  const filteredLeads = scopedLeads.filter(l => {
    const matchesSearch = 
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.phone.includes(searchQuery) ||
      (l.email && l.email.toLowerCase().includes(searchQuery.toLowerCase()));

    // Match any of the selected statuses in multi-select pool (if empty, matches all)
    const matchesStatus = 
      selectedStatuses.length === 0 || 
      selectedStatuses.includes(l.status) ||
      (selectedStatuses.includes("New Leads") && l.status === "New Lead"); // mapping fallback

    // Match activeMetricFilter
    let matchesMetric = true;
    if (activeMetricFilter === "today") {
      matchesMetric = l.createdAtStr?.includes("06 Jul") || l.createdAtStr?.includes("07 Jul") || l.createdAtStr?.includes("08 Jul") || false;
    } else if (activeMetricFilter === "visits") {
      matchesMetric = l.status === "Visit Schedule" || l.status === "Site Visit" || l.status === "Site Visit Scheduled" || l.status === "Meeting Scheduled";
    } else if (activeMetricFilter === "weekend") {
      // simulate weekend subset based on ID/attributes
      matchesMetric = (l.status === "Visit Schedule" || l.status === "Site Visit Scheduled" || l.status === "Follow up" || l.status === "New Lead") && (l.id.includes("2") || l.id.includes("4"));
    } else if (activeMetricFilter === "bookings") {
      matchesMetric = l.status === "Booked" || l.status === "Booking Done" || l.status === "Booking Approved";
    } else if (activeMetricFilter === "meta") {
      matchesMetric = l.campaign?.toLowerCase().includes("meta") || l.source?.toLowerCase().includes("meta") || l.campaign === "Facebook Lead Ads" || false;
    } else if (activeMetricFilter === "google") {
      matchesMetric = l.campaign?.toLowerCase().includes("google") || l.source?.toLowerCase().includes("google") || false;
    }

    return matchesSearch && matchesStatus && matchesMetric;
  });

  // Extract properties lists for Bulk Upload assignments
  const propertiesList = properties.map(p => p.name);
  // Real sales roster (agents + managers/TLs), not a hardcoded seed-data
  // snapshot — matches the same department === "SALES" scoping already used
  // for the Properties team-member picker.
  const agentsList = users
    .filter(u => u.department === "SALES" && u.status !== "INACTIVE")
    .map(u => u.name);

  // Callback Handlers
  const handleViewLeadDetails = (lead: Lead) => {
    setSelectedLead(lead);
  };

  const handleUpdateLeadStatus = (leadId: string, status: LeadStatus) => {
    // API Integration Point: call AppContext update status function
    updateLeadStatus(leadId, status, 500000, "contract.pdf");
    
    // Update local drawer state if active
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, status } : null);
    }

    setSuccessMsg(`Status updated to: ${status}`);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const handleAddManualLead = (data: {
    name: string;
    phone: string;
    email: string;
    agent: string;
    source: string;
    property: string;
    note: string;
  }) => {
    // API Integration Point: call addLead in AppContext
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
      setIsAddOpen(false);
      setSuccessMsg(`Successfully ingested lead for: ${data.name}`);
      setTimeout(() => setSuccessMsg(""), 4000);
    } else {
      alert(`Ingestion failed: ${res.error}`);
    }
  };

  const handleAddBulkLeads = (data: {
    assignmentMode: "project" | "agent";
    target: string;
    fileName: string;
  }) => {
    // API Integration Point: Upload spreadsheet to S3, parse rows, and insert leads
    alert(`Bulk Import Started!\nFile: ${data.fileName}\nAssignment Mode: ${data.assignmentMode} (${data.target})\nProcessing rows...`);

    // Ingest 3 mock spreadsheet leads to demonstrate reactivity
    const mockNames = ["Rohit Sharma", "Virat Kohli", "Jasprit Bumrah"];
    mockNames.forEach((n, idx) => {
      addLead({
        name: n,
        phone: `+91 99002233${idx}${idx}`,
        email: `${n.toLowerCase().replace(" ", "")}@inbox.com`,
        assignedAgent: data.assignmentMode === "agent" ? data.target : "Sanjeev Kumar",
        campaign: "Bulk Import",
        property: data.assignmentMode === "project" ? data.target : "Granada",
        leadScore: 75,
        createdAtStr: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      });
    });

    setIsAddOpen(false);
    setSuccessMsg(`Import Complete! Successfully processed and distributed leads from ${data.fileName}`);
    setTimeout(() => setSuccessMsg(""), 5000);
  };

  const handleDeleteLead = (leadId: string) => {
    if (confirm("Are you sure you want to delete this lead from the partition database?")) {
      // API Integration Point: call deleteLead in AppContext
      deleteLead(leadId);
      setSelectedLead(null);
      setSuccessMsg("Lead successfully deleted.");
      setTimeout(() => setSuccessMsg(""), 3000);
    }
  };

  const handleMetricFilterChange = (filter: string) => {
    setActiveMetricFilter(filter);
  };

  // Compute dynamic counts from real scoped leads & followups from backend state
  const dynamicTotalLeads = scopedLeads.length;
  const dynamicNewLeads = scopedLeads.filter(l => (l.status as string) === "New Leads" || (l.status as string) === "New Lead").length;
  const dynamicRNR = scopedLeads.filter(l => (l.status as string) === "RNR").length;
  const dynamicCallbacks = scopedLeads.filter(l => (l.status as string) === "Call Backs" || (l.status as string) === "Callback" || (l.status as string) === "Connected").length || followupCalls.length;
  const dynamicFollowups = scopedLeads.filter(l => (l.status as string) === "Follow-ups" || (l.status as string) === "Follow up" || (l.status as string) === "Interested").length || followupCalls.length;
  const dynamicSiteVisitScheduled = scopedLeads.filter(l => (l.status as string) === "Visit Schedule" || (l.status as string) === "Site Visit Scheduled" || (l.status as string) === "Meeting Scheduled").length;
  const dynamicSiteVisitDone = scopedLeads.filter(l => (l.status as string) === "Site Visit" || (l.status as string) === "Site Visit Done" || (l.status as string) === "Meeting Done").length;

  return (
    <div className="space-y-6 pb-12 animate-fade-in pt-1">
      {/* Top Right Action Button Bar */}
      <div className="flex justify-end items-center mb-2">
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center justify-center bg-[#07003E] hover:bg-[#120760] text-white px-7 py-2.5 rounded-[8px] text-xs font-semibold tracking-wide transition-all shadow-sm shrink-0"
        >
          + Upload Leads
        </button>
      </div>

      {/* Date Range Bar + Metric Cards Wrapped Section */}
      <div className="rounded-[16px] overflow-hidden border border-[#E2E4E8] shadow-sm">
        {/* Top Grey Date Filter Row */}
        <div className="bg-[#EBECEE] px-6 py-3.5 flex justify-between items-center text-xs font-semibold text-slate-800">
          <div className="flex items-center gap-1.5 cursor-pointer">
            <span className="text-[#4A5060] font-medium">Date Range</span>
            <span className="font-bold text-black">Today</span>
            <span className="text-[10px] text-black">▼</span>
          </div>
          <button className="text-[#1D5BD8] hover:underline font-medium text-xs">
            View Detailed Analytics
          </button>
        </div>

        {/* Metric Cards Row matching exact design */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 bg-white border-t border-[#E2E4E8] divide-x divide-[#E2E4E8]">
          <div className="px-5 py-4 flex flex-col justify-between h-[110px] hover:bg-slate-50/50 transition-colors cursor-pointer">
            <span className="text-[#7E8494] text-[13px] font-normal">Total Leads</span>
            <div className="flex justify-between items-end">
              <span className="text-black font-bold text-[22px] leading-none">{dynamicTotalLeads }</span>
              <span className="text-[#9CA3AF] text-[14px] font-bold mb-0.5">&gt;</span>
            </div> 
          </div>

          <div className="px-5 py-4 flex flex-col justify-between h-[100px] hover:bg-slate-50/50 transition-colors cursor-pointer">
            <span className="text-[#7E8494] text-[13px] font-normal">New Leads</span>
            <div className="flex justify-between items-end">
              <span className="text-black font-bold text-[22px] leading-none">{dynamicNewLeads }</span>
              <span className="text-[#9CA3AF] text-[14px] font-bold mb-0.5">&gt;</span>
            </div>
          </div>

          <div className="px-5 py-4 flex flex-col justify-between h-[100px] hover:bg-slate-50/50 transition-colors cursor-pointer">
            <span className="text-[#7E8494] text-[13px] font-normal">RNR</span>
            <div className="flex justify-between items-end">
              <span className="text-[#FF0000] font-bold text-[22px] leading-none">{dynamicRNR }</span>
              <span className="text-[#9CA3AF] text-[14px] font-bold mb-0.5">&gt;</span>
            </div>
          </div>

          <div className="px-5 py-4 flex flex-col justify-between h-[100px] hover:bg-slate-50/50 transition-colors cursor-pointer">
            <span className="text-[#7E8494] text-[13px] font-normal">Call Backs</span>
            <div className="flex justify-between items-end">
              <span className="text-[#FF9900] font-bold text-[22px] leading-none">{dynamicCallbacks }</span>
              <span className="text-[#9CA3AF] text-[14px] font-bold mb-0.5">&gt;</span>
            </div>
          </div>

          <div className="px-5 py-4 flex flex-col justify-between h-[100px] hover:bg-slate-50/50 transition-colors cursor-pointer">
            <span className="text-[#7E8494] text-[13px] font-normal">Follow Ups</span>
            <div className="flex justify-between items-end">
              <span className="text-[#0066FF] font-bold text-[22px] leading-none">{dynamicFollowups }</span>
              <span className="text-[#9CA3AF] text-[14px] font-bold mb-0.5">&gt;</span>
            </div>
          </div>

          <div className="px-5 py-4 flex flex-col justify-between h-[100px] hover:bg-slate-50/50 transition-colors cursor-pointer">
            <span className="text-[#7E8494] text-[13px] font-normal">Site Visit Scheduled</span>
            <div className="flex justify-between items-end">
              <span className="text-[#FF0000] font-bold text-[22px] leading-none">{dynamicSiteVisitScheduled }</span>
              <span className="text-[#9CA3AF] text-[14px] font-bold mb-0.5">&gt;</span>
            </div>
          </div>

          <div className="px-5 py-4 flex flex-col justify-between h-[100px] hover:bg-slate-50/50 transition-colors cursor-pointer">
            <span className="text-[#7E8494] text-[13px] font-normal">Site Visit Done</span>
            <div className="flex justify-between items-end">
              <span className="text-[#00A854] font-bold text-[22px] leading-none">{dynamicSiteVisitDone }</span>
              <span className="text-[#9CA3AF] text-[14px] font-bold mb-0.5">&gt;</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Follow ups Section */}
      <div className="bg-white border border-[#E2E4E8] rounded-[18px] p-6 shadow-sm space-y-4">
        <h3 className="text-[20px] font-bold text-black tracking-tight">Pending Follow ups</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 text-black font-bold">
                <th className="pb-3 font-bold text-black w-[150px]">Time</th>
                <th className="pb-3 font-bold text-black w-[200px]">
                  <div className="flex items-center gap-1">
                    <span>Lead Name</span>
                    <span className="text-slate-500 text-[11px]">🔍</span>
                  </div>
                </th>
                <th className="pb-3 font-bold text-black w-[180px]">
                  <div className="flex items-center gap-1">
                    <span>Assigned To</span>
                    <span className="text-slate-500 text-[10px]">▼</span>
                  </div>
                </th>
                <th className="pb-3 font-bold text-black min-w-[200px]">Feedback</th>
                <th className="pb-3 font-bold text-black w-[180px]">
                  <div className="flex items-center gap-1">
                    <span>Property</span>
                    <span className="text-slate-500 text-[10px]">▼</span>
                  </div>
                </th>
                <th className="pb-3 font-bold text-black text-right pr-4 w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/70">
              {followupCalls.length > 0 ? (
                followupCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 text-slate-700 font-normal leading-relaxed whitespace-nowrap">
                      {call.date}<br />{call.time}
                    </td>
                    <td className="py-4 whitespace-nowrap">
                      <div className="font-bold text-black text-[13px]">{call.leadName}</div>
                      <div className="text-[11px] text-slate-400 font-normal flex items-center gap-1 mt-0.5">
                        {call.phone || "+919997523452"} <span className="text-slate-300 text-[10px]">🔗</span>
                      </div>
                    </td>
                    <td className="py-4 text-slate-800 font-medium whitespace-nowrap">
                      {call.assignedTo || "Naveen Nai."} <span className="text-slate-500 text-[10px] ml-0.5">▼</span>
                    </td>
                    <td className="py-4 text-slate-800 font-normal leading-snug">
                      Looking for 4bhk<br />under 1 Cr
                    </td>
                    <td className="py-4 text-slate-800 font-medium whitespace-nowrap">Brigade Eternia</td>
                    <td className="py-4 text-right whitespace-nowrap pr-4">
                      <div className="flex items-center justify-end gap-2.5">
                        <button
                          onClick={() => triggerWhatsApp(call.phone || "+919997523452", call.leadName)}
                          className="w-[20px] h-[20px] rounded-full bg-black flex items-center justify-center hover:opacity-80 transition-opacity"
                          title="WhatsApp"
                        >
                          <svg className="w-2.5 h-2.5 fill-white text-white" viewBox="0 0 24 24">
                            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.535 1.961.854 3.148.855 3.18 0 5.767-2.587 5.768-5.766.001-3.18-2.585-5.767-5.767-5.767zm3.389 8.163c-.144.405-.837.774-1.17.823-.333.049-.757.085-2.45-.615-1.996-.827-3.267-2.881-3.367-3.014-.1-.133-.807-1.074-.807-2.049 0-.974.509-1.455.69-1.654.181-.199.395-.249.526-.249.131 0 .262.002.376.007.121.005.284-.046.444.339.16.386.549 1.34.597 1.439.048.099.08.216.015.348-.065.132-.098.214-.196.33-.098.116-.206.259-.294.348-.098.099-.201.207-.087.404.114.197.508.839 1.092 1.36.751.669 1.385.877 1.582.975.197.098.312.082.427-.049.115-.131.492-.574.623-.771.131-.197.262-.164.443-.098.181.066 1.15.542 1.347.64.197.098.328.147.376.23.048.082.048.477-.096.882z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => triggerCall(call.phone || "+919997523452", call.leadName)}
                          className="text-black hover:text-slate-700 transition-colors p-0.5"
                          title="Call"
                        >
                          <svg className="w-3.5 h-3.5 fill-black" viewBox="0 0 24 24">
                            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  <tr className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 text-slate-700 font-normal leading-relaxed whitespace-nowrap">
                      2026-07-16<br />08:30:00
                    </td>
                    <td className="py-4 whitespace-nowrap">
                      <div className="font-bold text-black text-[13px]">Aman Pratap</div>
                      <div className="text-[11px] text-slate-400 font-normal flex items-center gap-1 mt-0.5">
                        +919997523452 <span className="text-slate-300 text-[10px]">🔗</span>
                      </div>
                    </td>
                    <td className="py-4 text-slate-800 font-medium whitespace-nowrap">
                      Naveen Nai. <span className="text-slate-500 text-[10px] ml-0.5">▼</span>
                    </td>
                    <td className="py-4 text-slate-800 font-normal leading-snug">
                      Looking for 4bhk<br />under 1 Cr
                    </td>
                    <td className="py-4 text-slate-800 font-medium whitespace-nowrap">Brigade Eternia</td>
                    <td className="py-4 text-right whitespace-nowrap pr-4">
                      <div className="flex items-center justify-end gap-2.5">
                        <button
                          onClick={() => triggerWhatsApp("+919997523452", "Aman Pratap")}
                          className="w-[20px] h-[20px] rounded-full bg-black flex items-center justify-center hover:opacity-80 transition-opacity"
                          title="WhatsApp"
                        >
                          <svg className="w-2.5 h-2.5 fill-white text-white" viewBox="0 0 24 24">
                            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.535 1.961.854 3.148.855 3.18 0 5.767-2.587 5.768-5.766.001-3.18-2.585-5.767-5.767-5.767zm3.389 8.163c-.144.405-.837.774-1.17.823-.333.049-.757.085-2.45-.615-1.996-.827-3.267-2.881-3.367-3.014-.1-.133-.807-1.074-.807-2.049 0-.974.509-1.455.69-1.654.181-.199.395-.249.526-.249.131 0 .262.002.376.007.121.005.284-.046.444.339.16.386.549 1.34.597 1.439.048.099.08.216.015.348-.065.132-.098.214-.196.33-.098.116-.206.259-.294.348-.098.099-.201.207-.087.404.114.197.508.839 1.092 1.36.751.669 1.385.877 1.582.975.197.098.312.082.427-.049.115-.131.492-.574.623-.771.131-.197.262-.164.443-.098.181.066 1.15.542 1.347.64.197.098.328.147.376.23.048.082.048.477-.096.882z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => triggerCall("+919997523452", "Aman Pratap")}
                          className="text-black hover:text-slate-700 transition-colors p-0.5"
                          title="Call"
                        >
                          <svg className="w-3.5 h-3.5 fill-black" viewBox="0 0 24 24">
                            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 text-slate-700 font-normal leading-relaxed whitespace-nowrap">
                      2026-07-15<br />06:30:00
                    </td>
                    <td className="py-4 whitespace-nowrap">
                      <div className="font-bold text-black text-[13px]">Hidayat Jha</div>
                      <div className="text-[11px] text-slate-400 font-normal flex items-center gap-1 mt-0.5">
                        +919997523452 <span className="text-slate-300 text-[10px]">🔗</span>
                      </div>
                    </td>
                    <td className="py-4 text-slate-800 font-medium whitespace-nowrap">
                      Neha Chou.. <span className="text-slate-500 text-[10px] ml-0.5">▼</span>
                    </td>
                    <td className="py-4 text-slate-800 font-normal leading-snug">
                      Looking for 2bhk<br />under 1.5 Cr
                    </td>
                    <td className="py-4 text-slate-800 font-medium whitespace-nowrap">Brigade Eternia</td>
                    <td className="py-4 text-right whitespace-nowrap pr-4">
                      <div className="flex items-center justify-end gap-2.5">
                        <button
                          onClick={() => triggerWhatsApp("+919997523452", "Hidayat Jha")}
                          className="w-[20px] h-[20px] rounded-full bg-black flex items-center justify-center hover:opacity-80 transition-opacity"
                          title="WhatsApp"
                        >
                          <svg className="w-2.5 h-2.5 fill-white text-white" viewBox="0 0 24 24">
                            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.535 1.961.854 3.148.855 3.18 0 5.767-2.587 5.768-5.766.001-3.18-2.585-5.767-5.767-5.767zm3.389 8.163c-.144.405-.837.774-1.17.823-.333.049-.757.085-2.45-.615-1.996-.827-3.267-2.881-3.367-3.014-.1-.133-.807-1.074-.807-2.049 0-.974.509-1.455.69-1.654.181-.199.395-.249.526-.249.131 0 .262.002.376.007.121.005.284-.046.444.339.16.386.549 1.34.597 1.439.048.099.08.216.015.348-.065.132-.098.214-.196.33-.098.116-.206.259-.294.348-.098.099-.201.207-.087.404.114.197.508.839 1.092 1.36.751.669 1.385.877 1.582.975.197.098.328.147.376.23.048.082.048.477-.096.882z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => triggerCall("+919997523452", "Hidayat Jha")}
                          className="text-black hover:text-slate-700 transition-colors p-0.5"
                          title="Call"
                        >
                          <svg className="w-3.5 h-3.5 fill-black" viewBox="0 0 24 24">
                            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center pt-3 text-[11px] text-slate-500 border-t border-slate-100">
          <span className="font-bold text-black text-[12px]">{followupCalls.length || 9} Rows</span>
          <div className="flex items-center gap-6">
            <span>Rows per page: <span className="text-black font-semibold ml-1">100 ▼</span></span>
            <span>1-8 of {followupCalls.length || 8}</span>
            <div className="flex items-center gap-3 text-slate-400 font-bold cursor-pointer">
              <span className="hover:text-black">&lt;</span>
              <span className="hover:text-black">&gt;</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Call Backs Section */}
      <div className="bg-white border border-slate-200/80 rounded-[18px] p-6 shadow-sm space-y-4">
        <h3 className="text-[20px] font-bold text-black tracking-tight">Pending Call Backs</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 text-black font-bold">
                <th className="pb-3 font-bold text-black w-[150px]">Time</th>
                <th className="pb-3 font-bold text-black w-[200px]">
                  <div className="flex items-center gap-1">
                    <span>Lead Name</span>
                    <span className="text-slate-500 text-[11px]">🔍</span>
                  </div>
                </th>
                <th className="pb-3 font-bold text-black w-[180px]">
                  <div className="flex items-center gap-1">
                    <span>Assigned To</span>
                    <span className="text-slate-500 text-[10px]">▼</span>
                  </div>
                </th>
                <th className="pb-3 font-bold text-black min-w-[200px]">Feedback</th>
                <th className="pb-3 font-bold text-black w-[180px]">
                  <div className="flex items-center gap-1">
                    <span>Property</span>
                    <span className="text-slate-500 text-[10px]">▼</span>
                  </div>
                </th>
                <th className="pb-3 font-bold text-black text-right pr-4 w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/70">
              <tr className="hover:bg-slate-50/60 transition-colors">
                <td className="py-4 text-slate-700 font-normal leading-relaxed whitespace-nowrap">
                  2026-07-16<br />08:30:00
                </td>
                <td className="py-4 whitespace-nowrap">
                  <div className="font-bold text-black text-[13px]">Aman Pratap</div>
                  <div className="text-[11px] text-slate-400 font-normal flex items-center gap-1 mt-0.5">
                    +919997523452 <span className="text-slate-300 text-[10px]">🔗</span>
                  </div>
                </td>
                <td className="py-4 text-slate-800 font-medium whitespace-nowrap">
                  Naveen Nai. <span className="text-slate-500 text-[10px] ml-0.5">▼</span>
                </td>
                <td className="py-4 text-slate-800 font-normal leading-snug">
                  Looking for 4bhk<br />under 1 Cr
                </td>
                <td className="py-4 text-slate-800 font-medium whitespace-nowrap">Brigade Eternia</td>
                <td className="py-4 text-right whitespace-nowrap pr-4">
                  <div className="flex items-center justify-end gap-2.5">
                    <button
                      onClick={() => triggerWhatsApp("+919997523452", "Aman Pratap")}
                      className="w-[20px] h-[20px] rounded-full bg-black flex items-center justify-center hover:opacity-80 transition-opacity"
                      title="WhatsApp"
                    >
                      <svg className="w-2.5 h-2.5 fill-white text-white" viewBox="0 0 24 24">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.535 1.961.854 3.148.855 3.18 0 5.767-2.587 5.768-5.766.001-3.18-2.585-5.767-5.767-5.767zm3.389 8.163c-.144.405-.837.774-1.17.823-.333.049-.757.085-2.45-.615-1.996-.827-3.267-2.881-3.367-3.014-.1-.133-.807-1.074-.807-2.049 0-.974.509-1.455.69-1.654.181-.199.395-.249.526-.249.131 0 .262.002.376.007.121.005.284-.046.444.339.16.386.549 1.34.597 1.439.048.099.08.216.015.348-.065.132-.098.214-.196.33-.098.116-.206.259-.294.348-.098.099-.201.207-.087.404.114.197.508.839 1.092 1.36.751.669 1.385.877 1.582.975.197.098.328.147.376.23.048.082.048.477-.096.882z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => triggerCall("+919997523452", "Aman Pratap")}
                      className="text-black hover:text-slate-700 transition-colors p-0.5"
                      title="Call"
                    >
                      <svg className="w-3.5 h-3.5 fill-black" viewBox="0 0 24 24">
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Step 4: Add Lead Modal (Manual & Bulk Import) */}
      <AddLeadModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSubmitManual={handleAddManualLead}
        onSubmitBulk={handleAddBulkLeads}
        agentsList={agentsList}
        propertiesList={propertiesList}
      />

      {/* Step 5: Side Slide-Out Details Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        isOpen={selectedLead !== null}
        onClose={() => setSelectedLead(null)}
        onUpdateStatus={handleUpdateLeadStatus}
      />
    </div>
  );
}
