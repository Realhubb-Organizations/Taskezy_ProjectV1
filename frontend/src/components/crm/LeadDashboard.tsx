import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";
import { Sliders, Sparkles, Plus, Minus, Check, ChevronRight, ChevronLeft, Search, X, Mail, Phone, Users, Copy, FileText, Calendar, Download, ArrowLeft } from "lucide-react";
import TopMetricsCards from "./TopMetricsCards";
import LeadFilterBar from "./LeadFilterBar";
import LeadTable from "./LeadTable";
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

export default function LeadDashboard() {
  const {
    leads,
    addLead,
    updateLeadStatus,
    activeRole,
    deleteLead,
    editLead,
    currentUser,
    properties,
    calendarEvents
  } = useApp();

  const router = useRouter();
  const searchParams = useSearchParams();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<LeadStatus[]>([]);
  const [showStatusFilterDropdown, setShowStatusFilterDropdown] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [showAgentFilterDropdown, setShowAgentFilterDropdown] = useState(false);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [showCampaignFilterDropdown, setShowCampaignFilterDropdown] = useState(false);
  const [activeMetricFilter, setActiveMetricFilter] = useState("all");

  // Drawer / Modals State
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsRowsPerPage, setLeadsRowsPerPage] = useState(100);
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("2026-07-16");
  const [dateRange, setDateRange] = useState("Today");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    "Date", "Next Call Date", "Status", "Campaign"
  ]);

  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const [campaignSearchQuery, setCampaignSearchQuery] = useState("");
  const [statusSearchQuery, setStatusSearchQuery] = useState("");
  const [showLeadNameHeaderSearch, setShowLeadNameHeaderSearch] = useState(false);

  // Analytics specific states
  const [analyticsMemberSearch, setAnalyticsMemberSearch] = useState("");
  const [analyticsMemberFilter, setAnalyticsMemberFilter] = useState("all");
  const [analyticsPropertyFilter, setAnalyticsPropertyFilter] = useState("all");
  const [analyticsCampaignFilter, setAnalyticsCampaignFilter] = useState("all");
  const [analyticsDateRange, setAnalyticsDateRange] = useState("2026-07-16 - 2026-07-22");
  const [rnrSearchQuery, setRnrSearchQuery] = useState("");
  const [showMemberSearch, setShowMemberSearch] = useState(false);
  const [expandedMembers, setExpandedMembers] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };
  const [analyticsDetailFilter, setAnalyticsDetailFilter] = useState<{ memberName: string; category: string } | null>(null);

  const [uploadMode, setUploadMode] = useState<"single" | "bulk">("single");
  const [formLeadName, setFormLeadName] = useState("");
  const [formLeadEmail, setFormLeadEmail] = useState("");
  const [formLeadPhone, setFormLeadPhone] = useState("");
  const [formLeadStatus, setFormLeadStatus] = useState("");
  const [formLeadSource, setFormLeadSource] = useState("");
  const [formLeadAssignedTo, setFormLeadAssignedTo] = useState("");
  const [formLeadSubSource, setFormLeadSubSource] = useState("");
  const [formLeadProperty, setFormLeadProperty] = useState("");
  const [formLeadNotes, setFormLeadNotes] = useState("");

  const [formBulkProperty, setFormBulkProperty] = useState("");
  const [formBulkSource, setFormBulkSource] = useState("");
  const [formBulkFileName, setFormBulkFileName] = useState<string | null>(null);

  const mockLeads = [
    { id: "l1", name: "Aman Pratap", phone: "+919997523452", email: "amanjanu@gmail.com", status: "RNR", assignedTo: "Naveen Naidu", date: "2026-07-15 08:34:04", feedback: "Looking for 4bhk under 1 Cr", nextCallDate: "2026-07-16 08:30:00", campaign: "RH Granada Loc Vid Al" },
    { id: "l2", name: "Hidayat Jha", phone: "+919997523452", email: "jhakan5@gmail.com", status: "Call Back", assignedTo: "Neha Chourey", date: "2026-07-14 08:35:04", feedback: "Looking for 2bhk under 1.5 Cr", nextCallDate: "2026-07-15 06:30:00", campaign: "RH Eternia Loc Vid Al" },
    { id: "l3", name: "Shubham Ahmed", phone: "+919997523452", email: "ahmedu3@gmail.com", status: "Follow Up", assignedTo: "Santhosh Ray", date: "2026-07-14 07:14:34", feedback: "Asking for cashback to pr...", nextCallDate: "2026-07-15 16:30:00", campaign: "RH Habulus Loc Vid Al" },
    { id: "l4", name: "Aman Pratap", phone: "+919997523452", email: "amanjanu@gmail.com", status: "RNR", assignedTo: "Naveen Naidu", date: "2026-07-15 08:34:04", feedback: "Looking for 4bhk under 1 Cr", nextCallDate: "2026-07-16 08:30:00", campaign: "RH Granada Loc Vid Al" },
    { id: "l5", name: "Hidayat Jha", phone: "+919997523452", email: "jhakan5@gmail.com", status: "Call Back", assignedTo: "Neha Chourey", date: "2026-07-14 08:35:04", feedback: "Looking for 2bhk under 1.5 Cr", nextCallDate: "2026-07-15 06:30:00", campaign: "RH Eternia Loc Vid Al" },
    { id: "l6", name: "Shubham Ahmed", phone: "+919997523452", email: "ahmedu3@gmail.com", status: "Follow Up", assignedTo: "Santhosh Ray", date: "2026-07-14 07:14:34", feedback: "Asking for cashback to pr...", nextCallDate: "2026-07-15 16:30:00", campaign: "RH Habulus Loc Vid Al" },
    { id: "l7", name: "Aman Pratap", phone: "+919997523452", email: "amanjanu@gmail.com", status: "RNR", assignedTo: "Naveen Naidu", date: "2026-07-15 08:34:04", feedback: "Looking for 4bhk under 1 Cr", nextCallDate: "2026-07-16 08:30:00", campaign: "RH Granada Loc Vid Al" },
    { id: "l8", name: "Hidayat Jha", phone: "+919997523452", email: "jhakan5@gmail.com", status: "Call Back", assignedTo: "Neha Chourey", date: "2026-07-14 08:35:04", feedback: "Looking for 2bhk under 1.5 Cr", nextCallDate: "2026-07-15 06:30:00", campaign: "RH Granada Loc Vid Al" },
    { id: "l9", name: "Shubham Ahmed", phone: "+919997523452", email: "ahmedu3@gmail.com", status: "Follow Up", assignedTo: "Santhosh Ray", date: "2026-07-14 07:14:34", feedback: "Asking for cashback to pr...", nextCallDate: "2026-07-15 16:30:00", campaign: "RH Habulus Loc Vid Al" },
  ];

  let paginatedMockLeads: any[] = [];
  let totalMockLeadsPages = 1;

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

  // Define baseLeads using context leads if present, otherwise mockLeads
  const todayStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const baseLeads: any[] = leads.length > 0
    ? scopedLeads.map(l => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        email: l.email,
        status: l.status,
        assignedTo: l.assignedAgent,
        assignedAgent: l.assignedAgent,
        date: l.createdAtStr || todayStr,
        createdAtStr: l.createdAtStr || todayStr,
        feedback: l.logs && l.logs.length > 0 ? l.logs[l.logs.length - 1].message : "No feedback yet",
        nextCallDate: "N/A",
        campaign: l.campaign || l.source || "Organic",
        source: l.source || "Organic",
        rawLead: l
      }))
    : mockLeads.map(l => ({
        ...l,
        assignedAgent: l.assignedTo,
        createdAtStr: l.date,
        source: "Organic",
        rawLead: l
      }));

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
    // Reference date for mock data (2026-07-16) or real dates
    const refDate = (d.getFullYear() === 2026 && d.getMonth() === 6) ? new Date(2026, 6, 16) : now;
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

  const dateFilteredBaseLeads = baseLeads.filter(l => matchDateRange(l.date || l.createdAtStr, dateRange));

  // Dynamic filter logic
  const filteredLeads = dateFilteredBaseLeads.filter(l => {
    const matchesSearch = 
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.phone.includes(searchQuery) ||
      (l.email && l.email.toLowerCase().includes(searchQuery.toLowerCase()));

    // Match any of the selected statuses in multi-select pool (if empty, matches all)
    let matchesStatus = selectedStatuses.length === 0;
    if (!matchesStatus) {
      matchesStatus = selectedStatuses.some(status => {
        if (status === l.status) return true;
        if (status === "New Leads" && ["New Lead", "New Leads", "Assigned", "Unassigned"].includes(l.status)) return true;
        if (status === "Follow-ups" && ["Follow-ups", "Follow Up"].includes(l.status)) return true;
        if (status === "Call Back" && ["Call Back", "Switch off", "Connected", "Interested"].includes(l.status)) return true;
        if (status === "Visit Schedule" && ["Visit Schedule", "Site Visit Scheduled", "Meeting Scheduled"].includes(l.status)) return true;
        if (status === "Site Visit" && ["Site Visit", "Completed", "Meeting Done"].includes(l.status)) return true;
        return false;
      });
    }

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

    // Match any of the selected agents in multi-select pool (if empty, matches all)
    const matchesAgent = 
      selectedAgents.length === 0 || 
      (l.assignedAgent && selectedAgents.includes(l.assignedAgent)) ||
      (l.assignedTo && selectedAgents.includes(l.assignedTo));

    // Match any of the selected campaigns in multi-select pool (if empty, matches all)
    const matchesCampaign = 
      selectedCampaigns.length === 0 || 
      (l.campaign && selectedCampaigns.includes(l.campaign));

    return matchesSearch && matchesStatus && matchesAgent && matchesCampaign && matchesMetric;
  });

  paginatedMockLeads = filteredLeads.slice(
    (leadsPage - 1) * leadsRowsPerPage,
    leadsPage * leadsRowsPerPage
  );

  totalMockLeadsPages = Math.ceil(filteredLeads.length / leadsRowsPerPage);

  // Extract properties lists for Bulk Upload assignments
  const propertiesList = properties.map(p => p.name);
  const campaignsList = Array.from(new Set(baseLeads.map(l => l.campaign).filter(Boolean))) as string[];
  // Dedicated Agent list
  const agentsList = [
    "Santosh Ray",
    "Gautham Karanam",
    "Sanjeev Kumar",
    "Partha Mazumdar",
    "Akhil Raj Singh"
  ];

  // Dynamic counts for telemetry cards
  const totalLeadsCount = dateFilteredBaseLeads.length;
  const newLeadsCount = dateFilteredBaseLeads.filter(l => ["New Lead", "New Leads", "Assigned", "Unassigned"].includes(l.status)).length;
  const rnrLeadsCount = dateFilteredBaseLeads.filter(l => l.status === "RNR").length;
  const callBacksCount = dateFilteredBaseLeads.filter(l => ["Call Back", "Switch off", "Connected", "Interested"].includes(l.status)).length;
  const followUpsCount = dateFilteredBaseLeads.filter(l => ["Follow-ups", "Follow Up"].includes(l.status)).length;
  const siteVisitScheduledCount = dateFilteredBaseLeads.filter(l => ["Visit Schedule", "Site Visit Scheduled", "Meeting Scheduled"].includes(l.status)).length;
  const siteVisitDoneCount = dateFilteredBaseLeads.filter(l => ["Site Visit", "Completed", "Meeting Done"].includes(l.status)).length;

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
    note: string;
  }) => {
    // API Integration Point: call addLead in AppContext
    const res = addLead({
      name: data.name,
      phone: data.phone,
      email: data.email,
      assignedAgent: data.agent,
      campaign: data.source,
      property: propertiesList[0] || "Altura Project",
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

  if (currentUser?.role === "ADMIN") {
    const activeTab = searchParams.get("view") === "analytics" ? "analytics" : "leads";

    const updateView = (view: "leads" | "analytics") => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", view);
      router.push(`/dashboard/crm/leads?${params.toString()}`);
    };

    const mockMemberAnalytics = [
      { name: "Santosh Ray", total: 209, qualified: 53, unqualified: 156, siteVisits: 22, qlPct: "23.35%", ql2svPct: "41.50%" },
      { name: "Partha M", total: 209, qualified: 53, unqualified: 156, siteVisits: 22, qlPct: "23.35%", ql2svPct: "41.50%" },
      { name: "Santosh Ray", total: 209, qualified: 53, unqualified: 156, siteVisits: 22, qlPct: "23.35%", ql2svPct: "41.50%" },
      { name: "Naveen Naik", total: 209, qualified: 53, unqualified: 156, siteVisits: 22, qlPct: "23.35%", ql2svPct: "41.50%" },
      { name: "Santosh Ray", total: 209, qualified: 53, unqualified: 156, siteVisits: 22, qlPct: "23.35%", ql2svPct: "41.50%" },
    ];

    const filteredMemberAnalytics = mockMemberAnalytics.filter((row) => {
      const matchSearch = row.name.toLowerCase().includes(analyticsMemberSearch.toLowerCase());
      const matchMember = analyticsMemberFilter === "all" || row.name === analyticsMemberFilter;
      return matchSearch && matchMember;
    });

    const toggleExpand = (key: string) => {
      setExpandedMembers((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      );
    };

    return (
      <>
        <div className="space-y-6 pb-4 animate-fade-in text-slate-700">
        {/* Toggle Pill Group & Action buttons */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          {/* Toggle pill group on left */}
          <div className="bg-slate-200/60 p-1 rounded-xl flex items-center gap-1">
            <button
              onClick={() => {
                setAnalyticsDetailFilter(null);
                updateView("leads");
              }}
              className={`${
                activeTab === "leads"
                  ? "bg-white shadow-sm text-slate-800"
                  : "text-slate-405 hover:text-slate-600"
              } rounded-lg px-4 py-1.5 text-xs text-slate-800 font-bold cursor-pointer transition-all`}
            >
              Leads
            </button>
            <button
              onClick={() => {
                setAnalyticsDetailFilter(null);
                updateView("analytics");
              }}
              className={`${
                activeTab === "analytics"
                  ? "bg-white shadow-sm text-slate-800"
                  : "text-slate-405 hover:text-slate-600"
              } rounded-lg px-4 py-1.5 text-xs text-slate-800 font-bold cursor-pointer transition-all`}
            >
              Leads Analytics
            </button>
          </div>

          {/* Campaigns select & + Upload Leads button on right */}
          {activeTab === "leads" && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  value={campaignFilter}
                  onChange={(e) => setCampaignFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-700 font-bold focus:outline-none appearance-none pr-8 cursor-pointer"
                >
                  <option value="all">Campaigns</option>
                  <option value="RH Granada Loc Vid Al">RH Granada Loc Vid Al</option>
                  <option value="RH Eternia Loc Vid Al">RH Eternia Loc Vid Al</option>
                  <option value="RH Habulus Loc Vid Al">RH Habulus Loc Vid Al</option>
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[8px]">▼</span>
              </div>

              <button
                onClick={() => setIsAddOpen(true)}
                className="inline-flex items-center gap-2 bg-[#0B1E6E] hover:bg-[#081650] text-white px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Upload Leads
              </button>
            </div>
          )}
        </div>
      </div>

        {activeTab === "analytics" ? (
          analyticsDetailFilter ? (
            <div className="space-y-6 animate-fade-in text-slate-700">
              {/* Header / Back bar */}
              <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <button 
                  onClick={() => setAnalyticsDetailFilter(null)}
                  className="inline-flex items-center gap-2 border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4 text-slate-500" />
                  <span>Back</span>
                </button>
                
                <div className="flex items-center gap-3">
                  <button className="inline-flex items-center justify-center p-2.5 border border-slate-200 rounded-xl bg-white text-blue-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm cursor-pointer" title="Download Report">
                    <Download className="h-4 w-4" />
                  </button>

                  <button className="inline-flex items-center justify-center p-2.5 border border-slate-200 rounded-xl bg-white text-blue-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm cursor-pointer" title="Filter Settings">
                    <Sliders className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-xl px-3.5 py-2 text-xs text-slate-700 font-bold shadow-sm">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span>{analyticsDateRange}</span>
                  </div>

                  <div className="relative">
                    <select
                      className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-700 font-bold focus:outline-none appearance-none pr-8 cursor-pointer hover:border-slate-300 transition-all"
                    >
                      <option value="all">Property</option>
                      <option value="Granada">Granada</option>
                      <option value="Eternia">Eternia</option>
                      <option value="Habulus">Habulus</option>
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[8px]">▼</span>
                  </div>

                  <div className="relative">
                    <select
                      className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-700 font-bold focus:outline-none appearance-none pr-8 cursor-pointer hover:border-slate-300 transition-all"
                    >
                      <option value="all">Campaigns</option>
                      <option value="RH Granada Loc Vid Al">RH Granada Loc Vid Al</option>
                      <option value="RH Eternia Loc Vid Al">RH Eternia Loc Vid Al</option>
                      <option value="RH Habulus Loc Vid Al">RH Habulus Loc Vid Al</option>
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[8px]">▼</span>
                  </div>
                </div>
              </div>

              {/* Leads Table Card */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase font-bold text-slate-450 tracking-wider">
                        <th className="pb-3 pt-1 px-3">Lead Name</th>
                        <th className="pb-3 pt-1 px-3">Email</th>
                        <th className="pb-3 pt-1 px-3">Status</th>
                        <th className="pb-3 pt-1 px-3">Assigned To</th>
                        <th className="pb-3 pt-1 px-3">Date</th>
                        <th className="pb-3 pt-1 px-3">Notes</th>
                        <th className="pb-3 pt-1 px-3">Next Call Date</th>
                        <th className="pb-3 pt-1 px-3">Campaign</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                      {(leads.length > 0
                        ? leads.map(l => ({
                            id: l.id,
                            name: l.name,
                            phone: l.phone,
                            email: l.email,
                            status: l.status,
                            assignedTo: l.assignedAgent,
                            date: l.createdAtStr || "2026-07-16 08:00:00",
                            notes: l.property || "No notes",
                            nextCallDate: l.createdAtStr ? new Date(new Date(l.createdAtStr).getTime() + 86400000).toISOString().split('T')[0] : "2026-07-17",
                            campaign: l.campaign || "Campaign",
                            rawLead: l
                          }))
                        : mockLeads.map(l => ({
                            id: l.id,
                            name: l.name,
                            phone: l.phone,
                            email: l.email,
                            status: l.status,
                            assignedTo: l.assignedTo,
                            date: l.date,
                            notes: l.feedback,
                            nextCallDate: l.nextCallDate,
                            campaign: l.campaign,
                            rawLead: l
                          }))
                      )
                        .filter((l) => {
                          const agentName = l.assignedTo || "";
                          const matchMember = 
                            analyticsDetailFilter.memberName.toLowerCase() === "all" ||
                            agentName.toLowerCase().includes(analyticsDetailFilter.memberName.toLowerCase().split(" ")[0]);
                          
                          if (analyticsDetailFilter.category === "Qualified") {
                            return matchMember && ["Connected", "Interested", "Booked", "Follow-ups", "Visit Schedule", "Meeting Scheduled", "Meeting Done", "Site Visit"].includes(l.status);
                          }
                          if (analyticsDetailFilter.category === "Unqualified") {
                            return matchMember && ["Unassigned", "RNR", "Switch off", "Not Interested", "Invalid", "Low Budget", "Dead"].includes(l.status);
                          }
                          if (analyticsDetailFilter.category === "Site Visit") {
                            return matchMember && ["Site Visit", "Meeting Done", "Visit Schedule"].includes(l.status);
                          }
                          return matchMember;
                        })
                        .map((lead, index) => (
                          <tr key={lead.id || index} className="hover:bg-slate-50/40 transition-colors text-xs">
                            <td className="py-3 px-3 font-bold text-slate-800">
                              <div
                                onClick={() => setSelectedLead(lead.rawLead as any)}
                                className="font-bold text-[#0B1E6E] hover:underline cursor-pointer"
                              >
                                {lead.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                                <span>{lead.phone}</span>
                                <span
                                  className="cursor-pointer hover:text-slate-655"
                                  onClick={() => {
                                    navigator.clipboard.writeText(lead.phone);
                                    setSuccessMsg("Copied phone number!");
                                    setTimeout(() => setSuccessMsg(""), 2000);
                                  }}
                                  title="Copy Phone"
                                >
                                  📋
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-slate-500">
                              <span className="flex items-center gap-1">
                                {lead.email}
                                <span
                                  className="cursor-pointer hover:text-slate-655"
                                  onClick={() => {
                                    navigator.clipboard.writeText(lead.email);
                                    setSuccessMsg("Copied email!");
                                    setTimeout(() => setSuccessMsg(""), 2000);
                                  }}
                                  title="Copy Email"
                                >
                                  📋
                                </span>
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-block px-2.5 py-1.5 rounded-lg text-[10px] font-bold ${
                                ["Connected", "Interested", "Booked"].includes(lead.status)
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                  : ["RNR", "Switch off", "Dead"].includes(lead.status)
                                  ? "bg-rose-50 text-rose-700 border border-rose-100"
                                  : "bg-blue-50 text-blue-700 border border-blue-100"
                              }`}>
                                {lead.status}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-600 font-bold">{lead.assignedTo}</td>
                            <td className="py-3 px-3 text-slate-500">{lead.date}</td>
                            <td className="py-3 px-3 text-slate-500 truncate max-w-[150px]" title={lead.notes || "No notes"}>
                              {lead.notes || "No notes"}
                            </td>
                            <td className="py-3 px-3 text-slate-500">{lead.nextCallDate}</td>
                            <td className="py-3 px-3 text-slate-600 font-semibold">{lead.campaign}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 border-t border-slate-100 pt-4">
                  <span>6 Rows</span>
                  <div className="flex items-center gap-6 text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <span>Rows per page:</span>
                      <select className="bg-transparent font-bold focus:outline-none cursor-pointer text-slate-600">
                        <option>100</option>
                        <option>50</option>
                        <option>25</option>
                      </select>
                      <span className="text-[8px]">▼</span>
                    </div>
                    <span>1-8 of 8</span>
                    <div className="flex items-center gap-2">
                      <button className="p-1 rounded hover:bg-slate-50 text-slate-300 disabled:opacity-50 cursor-not-allowed" disabled>
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button className="p-1 rounded hover:bg-slate-50 text-slate-300 disabled:opacity-50 cursor-not-allowed" disabled>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in text-slate-700">
            {/* Action Filters Bar */}
            <div className="flex flex-wrap items-center justify-end gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <button className="inline-flex items-center justify-center p-2.5 border border-slate-200 rounded-xl bg-white text-blue-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm cursor-pointer" title="Download Report">
                <Download className="h-4 w-4" />
              </button>

              <button className="inline-flex items-center justify-center p-2.5 border border-slate-200 rounded-xl bg-white text-blue-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm cursor-pointer" title="Filter Settings">
                <Sliders className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-xl px-3.5 py-2 text-xs text-slate-700 font-bold shadow-sm focus-within:border-blue-500 transition-all">
                <Calendar className="h-4 w-4 text-blue-600" />
                <input
                  type="text"
                  value={analyticsDateRange}
                  onChange={(e) => setAnalyticsDateRange(e.target.value)}
                  className="bg-transparent focus:outline-none w-44 text-slate-750 font-bold"
                />
              </div>

              <div className="relative">
                <select
                  value={analyticsMemberFilter}
                  onChange={(e) => setAnalyticsMemberFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-700 font-bold focus:outline-none appearance-none pr-8 cursor-pointer hover:border-slate-300 transition-all"
                >
                  <option value="all">Member</option>
                  <option value="Santosh Ray">Santosh Ray</option>
                  <option value="Naveen Naik">Naveen Naik</option>
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[8px]">▼</span>
              </div>

              <div className="relative">
                <select
                  value={analyticsPropertyFilter}
                  onChange={(e) => setAnalyticsPropertyFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-700 font-bold focus:outline-none appearance-none pr-8 cursor-pointer hover:border-slate-300 transition-all"
                >
                  <option value="all">Property</option>
                  <option value="Granada">Granada</option>
                  <option value="Eternia">Eternia</option>
                  <option value="Habulus">Habulus</option>
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[8px]">▼</span>
              </div>

              <div className="relative">
                <select
                  value={analyticsCampaignFilter}
                  onChange={(e) => setAnalyticsCampaignFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-700 font-bold focus:outline-none appearance-none pr-8 cursor-pointer hover:border-slate-300 transition-all"
                >
                  <option value="all">Campaigns</option>
                  <option value="RH Granada Loc Vid Al">RH Granada Loc Vid Al</option>
                  <option value="RH Eternia Loc Vid Al">RH Eternia Loc Vid Al</option>
                  <option value="RH Habulus Loc Vid Al">RH Habulus Loc Vid Al</option>
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[8px]">▼</span>
              </div>
            </div>

            {/* Table Card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4">
              <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-200 text-[11px] uppercase font-bold text-slate-450 tracking-wider">
                      <th className="pb-3 pt-1 px-3 bg-white">
                        <div className="flex items-center gap-1.5 cursor-pointer hover:text-slate-750 transition-colors" onClick={() => setShowMemberSearch(!showMemberSearch)}>
                          <span>Member Name</span>
                          <Search className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                        {showMemberSearch && (
                          <input
                            type="text"
                            placeholder="Search name..."
                            value={analyticsMemberSearch}
                            onChange={(e) => setAnalyticsMemberSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 px-2 py-1 border border-slate-200 rounded-md text-[10px] w-32 font-medium focus:outline-none focus:border-blue-500"
                            autoFocus
                          />
                        )}
                      </th>
                      <th className="pb-3 pt-1 px-3">Total Leads Assigned</th>
                      <th className="pb-3 pt-1 px-3">Qualified Leads</th>
                      <th className="pb-3 pt-1 px-3">Unqualified Leads</th>
                      <th className="pb-3 pt-1 px-3">Site Visit Leads</th>
                      <th className="pb-3 pt-1 px-3">{"QL's %age"}</th>
                      <th className="pb-3 pt-1 px-3">QL2SV %age</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMemberAnalytics.map((row, idx) => {
                      const rowKey = `${row.name}-${idx}`;
                      const isExpanded = expandedMembers.includes(rowKey);
                      return (
                        <React.Fragment key={idx}>
                          <tr className={`hover:bg-slate-50/40 transition-colors font-medium text-slate-700 text-xs ${isExpanded ? "bg-slate-50" : ""}`}>
                            <td className="py-3 px-3 font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{row.name}</span>
                              <button
                                onClick={() => toggleExpand(rowKey)}
                                className="text-slate-500 hover:text-slate-800 focus:outline-none select-none cursor-pointer flex items-center justify-center p-0.5 hover:bg-slate-100 rounded transition-all"
                              >
                                {isExpanded ? (
                                  <Minus className="h-3.5 w-3.5 stroke-[2]" />
                                ) : (
                                  <Plus className="h-3.5 w-3.5 stroke-[2]" />
                                )}
                              </button>
                            </td>
                            <td className="py-3 px-3">
                              <button onClick={() => setAnalyticsDetailFilter({ memberName: row.name, category: "Total" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                {row.total}
                              </button>
                            </td>
                            <td className="py-3 px-3">
                              <button onClick={() => setAnalyticsDetailFilter({ memberName: row.name, category: "Qualified" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                {row.qualified}
                              </button>
                            </td>
                            <td className="py-3 px-3">
                              <button onClick={() => setAnalyticsDetailFilter({ memberName: row.name, category: "Unqualified" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                {row.unqualified}
                              </button>
                            </td>
                            <td className="py-3 px-3">
                              <button onClick={() => setAnalyticsDetailFilter({ memberName: row.name, category: "Site Visit" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                {row.siteVisits}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-slate-600">{row.qlPct}</td>
                            <td className="py-3 px-3 text-slate-600">{row.ql2svPct}</td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-white">
                              <td colSpan={7} className="py-4 pl-12 pr-6">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                      <th className="pb-2 pr-3 w-1/4">Team Member</th>
                                      <th className="pb-2 px-3">Total Leads Assigned</th>
                                      <th className="pb-2 px-3">Qualified Leads</th>
                                      <th className="pb-2 px-3">Unqualified Leads</th>
                                      <th className="pb-2 px-3">Site Visit Leads</th>
                                      <th className="pb-2 px-3">{"QL's %age"}</th>
                                      <th className="pb-2 px-3">QL2SV %age</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-slate-655 font-semibold">
                                    <tr className="hover:bg-slate-50/50 transition-colors">
                                      <td className="py-2.5 pr-3 text-slate-700 font-bold">Naveen Naik</td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Naveen Naik", category: "Total" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          89
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Naveen Naik", category: "Qualified" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          22
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Naveen Naik", category: "Unqualified" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          67
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Naveen Naik", category: "Site Visit" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          2
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">24.7%</td>
                                      <td className="py-2.5 px-3">9.02%</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors">
                                      <td className="py-2.5 pr-3 text-slate-700 font-bold">Neha Chourey</td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Neha Chourey", category: "Total" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          90
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Neha Chourey", category: "Qualified" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          20
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Neha Chourey", category: "Unqualified" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          70
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Neha Chourey", category: "Site Visit" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          10
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">22.2%</td>
                                      <td className="py-2.5 px-3">50%</td>
                                    </tr>
                                    <tr className="hover:bg-slate-55/50 transition-colors">
                                      <td className="py-2.5 pr-3 text-slate-700 font-bold">Navdeep Babra</td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Navdeep Babra", category: "Total" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          31
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Navdeep Babra", category: "Qualified" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          11
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Navdeep Babra", category: "Unqualified" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          20
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <button onClick={() => setAnalyticsDetailFilter({ memberName: "Navdeep Babra", category: "Site Visit" })} className="text-blue-600 hover:underline font-bold bg-transparent border-none cursor-pointer focus:outline-none">
                                          10
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-3">35.4%</td>
                                      <td className="py-2.5 px-3">90.9%</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 border-t border-slate-100 pt-4">
                <span>{filteredMemberAnalytics.length} Rows</span>
                <div className="flex items-center gap-6 text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <span>Rows per page:</span>
                    <select className="bg-transparent font-bold focus:outline-none cursor-pointer text-slate-600">
                      <option>100</option>
                      <option>50</option>
                      <option>25</option>
                    </select>
                    <span className="text-[8px]">▼</span>
                  </div>
                  <span>1-8 of 8</span>
                  <div className="flex items-center gap-2">
                    <button className="p-1 rounded hover:bg-slate-50 text-slate-300 disabled:opacity-50 cursor-not-allowed" disabled>
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button className="p-1 rounded hover:bg-slate-50 text-slate-300 disabled:opacity-50 cursor-not-allowed" disabled>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RNR Analysis Section */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4">
              <div className="flex justify-between items-center pb-2">
                <h3 className="text-sm font-bold text-slate-800 tracking-tight">RNR Analysis</h3>
                <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1 bg-slate-50/50 focus-within:bg-white focus-within:border-slate-305 transition-all">
                  <input
                    type="text"
                    placeholder="Lead Name"
                    value={rnrSearchQuery}
                    onChange={(e) => setRnrSearchQuery(e.target.value)}
                    className="bg-transparent focus:outline-none text-[10px] w-28 text-slate-700 font-medium"
                  />
                  <Search className="h-3 w-3 text-slate-400" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                      <th className="pb-3 pt-1 px-3">Total Leads</th>
                      <th className="pb-3 pt-1 px-3">Avg Call Back Initiation Per Lead / Day</th>
                      <th className="pb-3 pt-1 px-3">Avg Calling Per Lead before dead</th>
                      <th className="pb-3 pt-1 px-3">Date</th>
                      <th className="pb-3 pt-1 px-3">AI Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rnrSearchQuery === "" || "103".includes(rnrSearchQuery) || "80%".toLowerCase().includes(rnrSearchQuery.toLowerCase()) ? (
                      <tr className="hover:bg-slate-50/40 transition-colors font-medium text-slate-700 text-xs">
                        <td className="py-3.5 px-3">103</td>
                        <td className="py-3.5 px-3">3</td>
                        <td className="py-3.5 px-3">8</td>
                        <td className="py-3.5 px-3">2026-07-16</td>
                        <td className="py-3.5 px-3 text-[#0b1e6e] font-bold">80% time call is on RNR and rest 20% have low budget.</td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-400 font-bold">No records match your search</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          )
        ) : (
          <div className="space-y-6 pb-12 animate-fade-in text-slate-700">

        {/* Date Filter & Metrics Unified Container */}
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

          {/* 7 Columns Metric Grid */}
          <div className="flex md:grid md:grid-cols-7 bg-white divide-x divide-slate-100 overflow-x-auto min-w-full">
            {/* Total Leads */}
            <div 
              onClick={() => setSelectedStatuses([])}
              className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
                selectedStatuses.length === 0 ? "bg-slate-50/80 border-b-2 border-blue-600" : "bg-white hover:bg-slate-50/50"
              }`}
            >
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Leads</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-lg font-black text-slate-805">{totalLeadsCount}</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* New Leads */}
            <div 
              onClick={() => setSelectedStatuses(["New Leads"])}
              className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
                selectedStatuses.includes("New Leads") ? "bg-slate-50/80 border-b-2 border-blue-600" : "bg-white hover:bg-slate-50/50"
              }`}
            >
              <span className="text-[10px] font-bold text-slate-400 block uppercase">New Leads</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-lg font-black text-slate-805">{newLeadsCount}</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* RNR */}
            <div 
              onClick={() => setSelectedStatuses(["RNR"])}
              className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
                selectedStatuses.includes("RNR") ? "bg-slate-50/80 border-b-2 border-blue-600" : "bg-white hover:bg-slate-50/50"
              }`}
            >
              <span className="text-[10px] font-bold text-slate-400 block uppercase">RNR</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-lg font-black text-red-600">{rnrLeadsCount}</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Call Backs */}
            <div 
              onClick={() => setSelectedStatuses(["Call Back"])}
              className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
                selectedStatuses.includes("Call Back") ? "bg-slate-50/80 border-b-2 border-blue-600" : "bg-white hover:bg-slate-50/50"
              }`}
            >
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Call Backs</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-lg font-black text-amber-500">{callBacksCount}</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Follow Ups */}
            <div 
              onClick={() => setSelectedStatuses(["Follow-ups"])}
              className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
                selectedStatuses.includes("Follow-ups") ? "bg-slate-50/80 border-b-2 border-blue-600" : "bg-white hover:bg-slate-50/50"
              }`}
            >
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Follow Ups</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-lg font-black text-blue-600">{followUpsCount}</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Site Visit Scheduled */}
            <div 
              onClick={() => setSelectedStatuses(["Visit Schedule"])}
              className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
                selectedStatuses.includes("Visit Schedule") ? "bg-slate-50/80 border-b-2 border-blue-600" : "bg-white hover:bg-slate-50/50"
              }`}
            >
              <span className="text-[10px] font-bold text-slate-400 block uppercase leading-none">Site Visit Scheduled</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-lg font-black text-red-500">{siteVisitScheduledCount}</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Site Visit Done */}
            <div 
              onClick={() => setSelectedStatuses(["Site Visit"])}
              className={`p-4 flex flex-col justify-between min-h-[90px] cursor-pointer group min-w-[120px] md:min-w-0 flex-1 transition-all ${
                selectedStatuses.includes("Site Visit") ? "bg-slate-50/80 border-b-2 border-blue-600" : "bg-white hover:bg-slate-50/50"
              }`}
            >
              <span className="text-[10px] font-bold text-slate-400 block uppercase leading-none">Site Visit Done</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-lg font-black text-emerald-600">{siteVisitDoneCount}</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>
        </div>

        {/* Date Filter Input & Settings row */}
        <div className="flex justify-end items-center gap-3">
          <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-xs text-slate-700 font-bold shadow-sm">
            <Calendar className="h-4 w-4 text-blue-600" />
            <span>2026-07-16</span>
          </div>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-xs text-slate-700 font-bold shadow-sm hover:bg-slate-55 transition-all cursor-pointer"
          >
            <Sliders className="h-4 w-4 text-blue-600 rotate-90" />
            <span>Settings</span>
          </button>
        </div>

        {/* Main Leads Table Card */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden p-6 space-y-4">
          {selectedStatuses.length > 0 && (
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-black text-slate-800 tracking-tight">
                  {selectedStatuses.join(", ")} Leads
                </h3>
                <span className="bg-blue-50 text-blue-700 text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-blue-100">
                  {filteredLeads.length} {filteredLeads.length === 1 ? "Lead" : "Leads"}
                </span>
              </div>
              <button
                onClick={() => setSelectedStatuses([])}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" />
                <span>Show All Leads</span>
              </button>
            </div>
          )}
          <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="p-3">
                      {showLeadNameHeaderSearch ? (
                        <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 shadow-sm w-44">
                          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-transparent text-xs font-semibold text-slate-800 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                            autoFocus
                          />
                          <X
                            className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSearchQuery("");
                              setShowLeadNameHeaderSearch(false);
                            }}
                          />
                        </div>
                      ) : (
                        <div 
                          className="flex items-center gap-1.5 cursor-pointer hover:text-slate-700 transition-colors select-none"
                          onClick={() => setShowLeadNameHeaderSearch(true)}
                        >
                          <span>Lead Name</span>
                          <Search className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600" />
                        </div>
                      )}
                    </th>
                    <th className="p-3">Email</th>
                    <th className="p-3 relative">
                      <div 
                        className="flex items-center gap-1 cursor-pointer select-none hover:text-slate-700 transition-colors"
                        onClick={() => setShowStatusFilterDropdown(!showStatusFilterDropdown)}
                      >
                        <span>Status</span>
                        <span className="text-[8px]">▼</span>
                      </div>
                      
                      {showStatusFilterDropdown && (
                        <>
                          {/* Backdrop to close click away */}
                          <div 
                            className="fixed inset-0 z-20 cursor-default" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowStatusFilterDropdown(false);
                            }} 
                          />
                          
                          {/* Dropdown Card */}
                          <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-3 space-y-2 animate-fade-in normal-case text-slate-700 font-medium">
                            <div className="flex justify-between items-center pb-1.5 border-b border-slate-100 text-[10px] text-slate-400 font-bold">
                              <span>Filter Status</span>
                              {selectedStatuses.length > 0 && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedStatuses([]);
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
                                 placeholder="Search status..."
                                 value={statusSearchQuery}
                                 onChange={(e) => setStatusSearchQuery(e.target.value)}
                                 className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1 text-[11px] focus:outline-none"
                               />
                             </div>

                             <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs text-slate-600">
                               {availableStatuses.filter(status => status.toLowerCase().includes(statusSearchQuery.toLowerCase())).map((status) => {
                                 const isChecked = selectedStatuses.includes(status);
                                 return (
                                   <label key={status} className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-1 rounded transition-colors">
                                     <input 
                                       type="checkbox"
                                       checked={isChecked}
                                       onChange={() => {
                                         if (isChecked) {
                                           setSelectedStatuses(selectedStatuses.filter(s => s !== status));
                                         } else {
                                           setSelectedStatuses([...selectedStatuses, status]);
                                         }
                                       }}
                                       className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 border-slate-300"
                                     />
                                     <span className="truncate">{status}</span>
                                   </label>
                                 );
                               })}
                             </div>
                          </div>
                        </>
                      )}
                    </th>
                    <th className="p-3 relative">
                      <div 
                        className="flex items-center gap-1 cursor-pointer select-none hover:text-slate-700 transition-colors"
                        onClick={() => setShowAgentFilterDropdown(!showAgentFilterDropdown)}
                      >
                        <span>Assigned To</span>
                        <span className="text-[8px]">▼</span>
                      </div>
                      
                      {showAgentFilterDropdown && (
                        <>
                          {/* Backdrop to close click away */}
                          <div 
                            className="fixed inset-0 z-20 cursor-default" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAgentFilterDropdown(false);
                            }} 
                          />
                          
                          {/* Dropdown Card */}
                          <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-3 space-y-2 normal-case text-slate-700 font-medium">
                            <div className="flex justify-between items-center pb-1.5 border-b border-slate-100 text-[10px] text-slate-400 font-bold">
                              <span>Filter Agent</span>
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
                                placeholder="Search agent..."
                                value={agentSearchQuery}
                                onChange={(e) => setAgentSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1 text-[11px] focus:outline-none"
                              />
                            </div>

                            <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs text-slate-600">
                              {agentsList.filter(agent => agent.toLowerCase().includes(agentSearchQuery.toLowerCase())).map((agent) => {
                                const isChecked = selectedAgents.includes(agent);
                                return (
                                  <label key={agent} className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-1 rounded transition-colors">
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
                                    <span className="truncate">{agent}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3">Next Call Date</th>
                    <th className="p-3 relative">
                      <div 
                        className="flex items-center gap-1 cursor-pointer select-none hover:text-slate-700 transition-colors"
                        onClick={() => setShowCampaignFilterDropdown(!showCampaignFilterDropdown)}
                      >
                        <span>Campaign</span>
                        <span className="text-[8px]">▼</span>
                      </div>
                      
                      {showCampaignFilterDropdown && (
                        <>
                          {/* Backdrop to close click away */}
                          <div 
                            className="fixed inset-0 z-20 cursor-default" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCampaignFilterDropdown(false);
                            }} 
                          />
                          
                          {/* Dropdown Card */}
                          <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-3 space-y-2 normal-case text-slate-700 font-medium">
                            <div className="flex justify-between items-center pb-1.5 border-b border-slate-100 text-[10px] text-slate-400 font-bold">
                              <span>Filter Campaign</span>
                              {selectedCampaigns.length > 0 && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCampaigns([]);
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
                                placeholder="Search campaign..."
                                value={campaignSearchQuery}
                                onChange={(e) => setCampaignSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1 text-[11px] focus:outline-none"
                              />
                            </div>
                            
                            <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs text-slate-600">
                              {campaignsList.filter(campaign => campaign.toLowerCase().includes(campaignSearchQuery.toLowerCase())).map((campaign) => {
                                const isChecked = selectedCampaigns.includes(campaign);
                                return (
                                  <label key={campaign} className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-1 rounded transition-colors">
                                    <input 
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        if (isChecked) {
                                          setSelectedCampaigns(selectedCampaigns.filter(c => c !== campaign));
                                        } else {
                                          setSelectedCampaigns([...selectedCampaigns, campaign]);
                                        }
                                      }}
                                      className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 border-slate-300"
                                    />
                                    <span className="truncate">{campaign}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-705 font-semibold">
                  {paginatedMockLeads.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <p 
                          onClick={() => setSelectedLead(row as any)} 
                          className="font-bold text-[#0B1E6E] hover:underline cursor-pointer"
                        >
                          {row.name}
                        </p>
                        <CopyablePhone phone={row.phone} />
                      </td>
                      <td className="p-3 text-slate-500">{row.email}</td>
                      <td className="p-3">
                        <div className="relative inline-block">
                          <select
                            value={row.status}
                            onChange={(e) => {}}
                            className="bg-transparent border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 font-bold focus:outline-none appearance-none pr-5 cursor-pointer"
                          >
                            <option value={row.status}>{row.status}</option>
                            <option value="Call Back">Call Back</option>
                            <option value="Follow Up">Follow Up</option>
                            <option value="RNR">RNR</option>
                          </select>
                          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 text-[6px] pointer-events-none">▼</span>
                        </div>
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
              <span>{filteredLeads.length} Rows</span>
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
                    {Math.min(filteredLeads.length, (leadsPage - 1) * leadsRowsPerPage + 1)}-
                    {Math.min(filteredLeads.length, leadsPage * leadsRowsPerPage)} of {filteredLeads.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button 
                      disabled={leadsPage === 1}
                      onClick={() => setLeadsPage(p => Math.max(1, p - 1))}
                      className="p-1 hover:bg-slate-200 rounded disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 text-slate-600" />
                    </button>
                    <button 
                      disabled={leadsPage >= totalMockLeadsPages}
                      onClick={() => setLeadsPage(p => Math.min(totalMockLeadsPages, p + 1))}
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
      </div>
    )}
          {isAddOpen && (
          <>
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60]" onClick={() => setIsAddOpen(false)} />
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <div className="w-full max-w-4xl bg-white rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-scale-up text-xs">
                {/* Header */}
                <div className="flex justify-between items-start px-12 pt-10 pb-4 shrink-0">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">Upload New Lead</h3>
                    <p className="text-xs text-slate-500 mt-2 font-medium">Enter a single new lead or upload multiple leads from an Excel file.</p>
                  </div>
                  <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-655 cursor-pointer mt-1">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="px-12 shrink-0">
                  <hr className="border-slate-100/80" />
                </div>

                {/* Body */}
                <div className="flex-1 px-12 pt-6 pb-10 space-y-6 text-xs">
                  {/* Mode Toggles */}
                  <div className="flex items-center gap-8 font-bold text-slate-700">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="uploadMode"
                        checked={uploadMode === "single"}
                        onChange={() => setUploadMode("single")}
                        className="h-4 w-4 text-[#0B1E6E] focus:ring-[#0B1E6E] border-slate-300"
                      />
                      <span>Single Entry</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="uploadMode"
                        checked={uploadMode === "bulk"}
                        onChange={() => setUploadMode("bulk")}
                        className="h-4 w-4 text-[#0B1E6E] focus:ring-[#0B1E6E] border-slate-300"
                      />
                      <span>Bulk Upload</span>
                    </label>
                  </div>

                  {/* Single Entry Screen */}
                  {uploadMode === "single" && (
                    <div className="grid grid-cols-3 gap-6 animate-fade-in text-slate-900">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-900 mb-1.5 uppercase">Lead Full Name</label>
                        <input
                          type="text"
                          value={formLeadName}
                          onChange={(e) => setFormLeadName(e.target.value)}
                          placeholder="e.g. lead name"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#0B1E6E] shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-900 mb-1.5 uppercase">Email</label>
                        <input
                          type="email"
                          value={formLeadEmail}
                          onChange={(e) => setFormLeadEmail(e.target.value)}
                          placeholder="e.g. enter email"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#0B1E6E] shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-900 mb-1.5 uppercase">Phone Number</label>
                        <input
                          type="tel"
                          value={formLeadPhone}
                          onChange={(e) => setFormLeadPhone(e.target.value)}
                          placeholder="e.g. phone number"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#0B1E6E] shadow-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-900 mb-1.5 uppercase">Status</label>
                        <div className="relative">
                          <select
                            value={formLeadStatus}
                            onChange={(e) => setFormLeadStatus(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#0B1E6E] shadow-sm appearance-none cursor-pointer"
                          >
                            <option value="">Select Status</option>
                            <option value="RNR">RNR</option>
                            <option value="Call Back">Call Back</option>
                            <option value="Follow Up">Follow Up</option>
                            <option value="Visit Schedule">Visit Schedule</option>
                          </select>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-450 text-[9px]">▼</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-900 mb-1.5 uppercase">Source</label>
                        <div className="relative">
                          <select
                            value={formLeadSource}
                            onChange={(e) => setFormLeadSource(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#0B1E6E] shadow-sm appearance-none cursor-pointer"
                          >
                            <option value="">Select Source</option>
                            <option value="Meta Ads">Meta Ads</option>
                            <option value="Google Ads">Google Ads</option>
                            <option value="Organic">Organic</option>
                            <option value="Direct">Direct</option>
                          </select>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-455 text-[9px]">▼</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-900 mb-1.5 uppercase">Assigned To</label>
                        <div className="relative">
                          <select
                            value={formLeadAssignedTo}
                            onChange={(e) => setFormLeadAssignedTo(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#0B1E6E] shadow-sm appearance-none cursor-pointer"
                          >
                            <option value="">Select Member</option>
                            <option value="Naveen Naidu">Naveen Naidu</option>
                            <option value="Neha Chourey">Neha Chourey</option>
                            <option value="Santhosh Ray">Santhosh Ray</option>
                          </select>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-455 text-[9px]">▼</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-900 mb-1.5 uppercase">Sub Source</label>
                        <input
                          type="text"
                          value={formLeadSubSource}
                          onChange={(e) => setFormLeadSubSource(e.target.value)}
                          placeholder="enter sub source"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#0B1E6E] shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-900 mb-1.5 uppercase">Property</label>
                        <div className="relative">
                          <select
                            value={formLeadProperty}
                            onChange={(e) => setFormLeadProperty(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#0B1E6E] shadow-sm appearance-none cursor-pointer"
                          >
                            <option value="">Select property</option>
                            <option value="RH Granada Loc Vid Al">RH Granada Loc Vid Al</option>
                            <option value="RH Eternia Loc Vid Al">RH Eternia Loc Vid Al</option>
                            <option value="RH Habulus Loc Vid Al">RH Habulus Loc Vid Al</option>
                          </select>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-455 text-[9px]">▼</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-900 mb-1.5 uppercase">Notes</label>
                        <input
                          type="text"
                          value={formLeadNotes}
                          onChange={(e) => setFormLeadNotes(e.target.value)}
                          placeholder="Add notes"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#0B1E6E] shadow-sm"
                        />
                      </div>
                    </div>
                  )}

                  {/* Bulk Upload Screen */}
                  {uploadMode === "bulk" && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-fade-in text-slate-900 items-start">
                      {/* Left inputs */}
                      <div className="col-span-7 space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-extrabold text-slate-900 mb-1.5 uppercase">Select Property</label>
                            <div className="relative">
                              <select
                                value={formBulkProperty}
                                onChange={(e) => setFormBulkProperty(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#0B1E6E] shadow-sm appearance-none cursor-pointer"
                              >
                                <option value="">Select property</option>
                                <option value="RH Granada Loc Vid Al">RH Granada Loc Vid Al</option>
                                <option value="RH Eternia Loc Vid Al">RH Eternia Loc Vid Al</option>
                                <option value="RH Habulus Loc Vid Al">RH Habulus Loc Vid Al</option>
                              </select>
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-450 text-[9px]">▼</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-extrabold text-slate-900 mb-1.5 uppercase">Source</label>
                            <div className="relative">
                              <select
                                value={formBulkSource}
                                onChange={(e) => setFormBulkSource(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#0B1E6E] shadow-sm appearance-none cursor-pointer"
                              >
                                <option value="">Select source</option>
                                <option value="Meta Ads">Meta Ads</option>
                                <option value="Google Ads">Google Ads</option>
                                <option value="Organic">Organic</option>
                                <option value="Direct">Direct</option>
                              </select>
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-450 text-[9px]">▼</span>
                            </div>
                          </div>
                        </div>

                        {/* File Upload Box */}
                        <div 
                          onClick={() => {
                            const n = prompt("Enter simulated Excel sheet filename (e.g. leads_sheet.xlsx):");
                            if (n) setFormBulkFileName(n);
                          }}
                          className="border border-dashed border-[#5C73E5]/30 bg-blue-50/10 rounded-2xl p-8 text-center cursor-pointer hover:bg-blue-50/20 transition-all flex flex-col items-center justify-center min-h-[160px] space-y-2 shadow-sm"
                        >
                          <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center mb-1">
                            <span className="text-blue-600 text-lg">↑</span>
                          </div>
                          <span className="text-xs font-bold text-blue-600 block">Upload a file</span>
                          <span className="text-[10px] text-slate-400 block font-medium">Click to browse, or drag &amp; drop files here</span>
                          {formBulkFileName && (
                            <span className="text-[10px] font-bold text-emerald-600 mt-2 block">✓ {formBulkFileName}</span>
                          )}
                        </div>

                        <div className="flex justify-center">
                          <button className="flex items-center gap-1.5 border border-slate-200 bg-white rounded-lg px-4 py-2 text-[10px] text-slate-700 font-bold shadow-sm hover:bg-slate-50 transition-all cursor-pointer">
                            <span className="text-xs font-mono">⤓</span>
                            <span>Download Template</span>
                          </button>
                        </div>

                        <p className="text-[10px] text-slate-400 font-semibold mt-4">
                          Still facing issues? <a href="#" className="text-blue-600 hover:underline">Contact support</a>
                        </p>
                      </div>

                      {/* Right vector illustration & action buttons */}
                      <div className="col-span-5 flex flex-col items-end justify-between self-stretch pt-2">
                        <div className="flex items-center justify-center w-full flex-1">
                          <svg className="w-full max-w-[360px] h-auto" viewBox="0 0 280 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {/* Cloud shadow and main cloud */}
                            <path d="M120 70C120 53.4315 133.431 40 150 40C166.569 40 180 53.4315 180 70C191.046 70 200 78.9543 200 90C200 101.046 191.046 110 180 110H120C108.954 110 100 101.046 100 90C100 78.9543 108.954 70 120 70Z" fill="#93C5FD" opacity="0.6"/>
                            <path d="M125 75C125 61.1929 136.193 50 150 50C163.807 50 175 61.1929 175 75C183.284 75 190 81.7157 190 90C190 98.2843 183.284 105 175 105H125C116.716 105 110 98.2843 110 90C110 81.7157 116.716 75 125 75Z" fill="#3B82F6" opacity="0.8"/>
                            <path d="M150 60V95M140 70L150 60L160 70" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                            
                            {/* Box */}
                            <rect x="110" y="120" width="70" height="50" rx="4" fill="#3B82F6"/>
                            <path d="M106 120H184L176 110H114L106 120Z" fill="#2563EB"/>
                            <rect x="125" y="115" width="20" height="15" fill="#10B981" rx="2"/>
                            <rect x="150" y="112" width="15" height="20" fill="#EF4444" rx="2"/>

                            {/* Left Person (Green shirt, Orange hair, Pink pants) */}
                            <circle cx="85" cy="98" r="7" fill="#FDBA74"/>
                            <path d="M80 91C80 91 88 88 92 93C96 98 90 102 90 102L83 102L80 91Z" fill="#F97316"/>
                            <path d="M75 105C75 105 88 105 92 112L85 128H75L75 105Z" fill="#047857"/>
                            <path d="M75 128H85L85 155H80L78 140L75 155H70L75 128Z" fill="#EC4899"/>
                            <path d="M88 112L105 102" stroke="#FDBA74" strokeWidth="3" strokeLinecap="round"/>

                            {/* Right Person (Purple shirt, Brown hair, Pink pants) */}
                            <circle cx="215" cy="95" r="7" fill="#FDBA74"/>
                            <path d="M210 88C215 88 220 90 220 95C220 100 212 102 210 98" fill="#78350F"/>
                            <path d="M205 102C210 102 220 105 220 115L215 130H200L205 102Z" fill="#7C3AED"/>
                            <path d="M200 130H215L220 158H215L210 142L205 158H200L200 130Z" fill="#EC4899"/>
                            <path d="M205 110L185 118" stroke="#FDBA74" strokeWidth="3" strokeLinecap="round"/>

                            {/* Photo Asset being held */}
                            <rect x="95" y="85" width="28" height="28" rx="4" fill="#EF4444" transform="rotate(-15 95 85)"/>
                            <circle cx="105" cy="95" r="3" fill="white"/>
                            <path d="M98 108L108 98L118 108" fill="white"/>
                          </svg>
                        </div>

                        {/* Action buttons */}
                        <div className="flex justify-end gap-3 mt-6">
                          <button
                            onClick={() => setIsAddOpen(false)}
                            className="px-6 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer bg-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              if (!formBulkFileName) {
                                alert("Please select or drop a file to bulk upload.");
                                return;
                              }
                              setSuccessMsg(`Successfully processed spreadsheet: ${formBulkFileName}`);
                              setIsAddOpen(false);
                              setTimeout(() => setSuccessMsg(""), 3000);
                            }}
                            className="bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
                          >
                            Upload
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Single entry footer fallback if single entry is open */}
                  {uploadMode === "single" && (
                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                      <button
                        onClick={() => setIsAddOpen(false)}
                        className="px-6 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer bg-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (!formLeadName || !formLeadPhone) {
                            alert("Please fill in Lead Full Name and Phone Number.");
                            return;
                          }
                          addLead({
                            name: formLeadName,
                            phone: formLeadPhone,
                            email: formLeadEmail,
                            assignedAgent: formLeadAssignedTo || "Santhosh Ray",
                            campaign: formLeadProperty || "RH Granada Loc Vid Al",
                            property: formLeadProperty || "Brigade Granada",
                            leadScore: 80,
                            createdAtStr: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                          });
                          setSuccessMsg(`Successfully uploaded single lead: ${formLeadName}`);
                          setIsAddOpen(false);
                          setTimeout(() => setSuccessMsg(""), 3000);
                        }}
                        className="bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
                      >
                        Upload
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Lead details slide-out drawer (Right side) */}
        {selectedLead && (
          <div className="fixed inset-0 z-50 overflow-hidden text-slate-700">
            {/* Backdrop */}
            <div 
              onClick={() => setSelectedLead(null)}
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] transition-opacity cursor-pointer" 
            />

            <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
              <div className="w-screen max-w-lg bg-white shadow-2xl relative flex flex-col p-8 overflow-y-auto rounded-l-2xl animate-slide-in space-y-6">
                
                {/* Header Close button */}
                <div className="flex justify-end border-b border-slate-100 pb-3 -mx-4 px-4">
                  <button 
                    onClick={() => setSelectedLead(null)}
                    className="text-slate-400 hover:text-slate-655 cursor-pointer p-1"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Lead Title & Contacts block */}
                <div className="space-y-4">
                  <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{selectedLead.name}</h3>
                  
                  <div className="space-y-2.5 text-slate-600 text-xs font-semibold">
                    {/* Phone / Whatsapp row */}
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-emerald-500 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.968C16.588 1.971 14.12 .95 11.5 .95c-5.44 0-9.866 4.372-9.87 9.802 0 1.706.463 3.375 1.34 4.834L1.93 20.315l4.717-1.161zM17.43 14.53c-.32-.16-1.89-.93-2.18-1.04-.3-.11-.51-.17-.72.15-.22.32-.83 1.04-1.02 1.25-.19.21-.38.24-.7.08-.31-.16-1.33-.49-2.54-1.57-.94-.84-1.58-1.87-1.76-2.18-.18-.31-.02-.48.14-.64.14-.14.32-.37.48-.56.16-.18.21-.31.32-.51.11-.21.05-.39-.03-.56-.08-.17-.72-1.74-.99-2.39-.26-.64-.52-.55-.72-.56-.19-.01-.41-.01-.63-.01-.22 0-.57.08-.87.41-.3.32-1.15 1.13-1.15 2.75a4.78 4.78 0 00.99 2.53c.1.14 1.93 2.94 4.67 4.12.65.28 1.16.45 1.56.57.65.21 1.24.18 1.7.11.52-.08 1.89-.77 2.15-1.52.27-.75.27-1.4.19-1.52-.08-.12-.3-.19-.62-.35z" />
                      </svg>
                      <Phone className="h-3.5 w-3.5 text-slate-900" />
                      <span className="font-bold text-slate-800">{selectedLead.phone}</span>
                      <button className="text-slate-350 hover:text-slate-600 p-0.5" title="Copy Number">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Email row */}
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-slate-900" />
                      <span className="underline text-slate-700 hover:text-slate-900 font-bold">{selectedLead.email || "amanpratap1@gmail.com"}</span>
                      <button className="text-slate-350 hover:text-slate-650 p-0.5" title="Copy Email">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status and Action pills */}
                <div className="flex justify-between items-center border-t border-slate-100 pt-4 text-xs font-bold">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-900">Current Status :</span>
                    <div className="relative">
                      <select
                        value={selectedLead.status}
                        onChange={(e) => handleUpdateLeadStatus(selectedLead.id, e.target.value as LeadStatus)}
                        className="bg-[#FCF7E5] text-[#D97706] border border-[#F59E0B]/50 rounded-lg px-2.5 py-0.5 pr-6 font-extrabold focus:outline-none appearance-none cursor-pointer text-[10px]"
                      >
                        <option value="RNR">RNR</option>
                        <option value="Call Back">Call Back</option>
                        <option value="Follow Up">Follow Up</option>
                        <option value="Visit Schedule">Visit Schedule</option>
                      </select>
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-[8px]">▼</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button className="text-slate-700 hover:text-slate-900 inline-flex items-center gap-1.5 text-xs font-bold border border-slate-200 bg-white rounded-lg px-2.5 py-1">
                      <FileText className="h-3.5 w-3.5 text-slate-500" />
                      Notes
                      <span className="text-[8px]">▼</span>
                    </button>
                  </div>
                </div>

                {/* Timestamps and Meta Sources */}
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                  <span>Last Updated : <strong className="text-slate-500">28 Jun 2026 | 10:34 am</strong></span>
                  <span className="flex items-center gap-1">
                    Source : 
                    <span className="text-blue-500 text-sm font-extrabold leading-none" title="Meta Ads">∞</span>
                  </span>
                </div>

                {/* Spec Metadata Grid */}
                <div className="grid grid-cols-2 gap-y-4 gap-x-6 border-t border-b border-slate-100 py-4 text-xs">
                  <div>
                    <span className="text-slate-900 font-bold block">Assigned To :</span>
                    <div className="flex items-center gap-1 mt-1 font-semibold text-slate-655">
                      <svg className="w-3.5 h-3.5 text-slate-450 mr-1 fill-current" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                      <span>{selectedLead.assignedAgent || "Santosh Ray"}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-900 font-bold block">Property :</span>
                    <span className="block mt-1 font-semibold text-slate-655">{selectedLead.property || "Brigade Granada"}</span>
                  </div>

                  <div>
                    <span className="text-slate-900 font-bold block">Reassigned To :</span>
                    <div className="flex items-center gap-1 mt-1 font-semibold text-slate-655">
                      <svg className="w-3.5 h-3.5 text-slate-450 mr-1 fill-current" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                      <span>Naveen Naik</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-900 font-bold block">Captured at :</span>
                    <span className="block mt-1 font-semibold text-slate-655">20 Jun 2026 | 11:05 pm</span>
                  </div>
                </div>

                {/* Activity History timeline container */}
                <div className="space-y-4 flex-1">
                  <h4 className="text-sm font-bold text-slate-900">Activity History :</h4>
                  
                  {/* Unified timeline wrap box */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 shadow-sm">
                    <div className="relative pl-6 space-y-6 border-l-2 border-[#5C73E5]/60 ml-2">
                      
                      {/* Event 1 */}
                      <div className="relative">
                        <span className="absolute -left-[30px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-slate-400 shadow-sm" />
                        
                        <div className="space-y-2">
                          <span className="inline-block bg-[#0B2545] text-white text-[9.5px] font-bold px-2 py-0.5 rounded-md">
                            22 June 2026 | 11:23 am
                          </span>
                          
                          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm space-y-2.5 text-slate-655 font-semibold leading-relaxed">
                            <p className="text-xs">
                              Show interest and site visit is scheduled on 25th June 2026 at 1 pm and require details on the same.
                            </p>
                            <div className="flex justify-between items-center text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-bold">
                              <span className="text-slate-500">Call Back &rarr; Follow Up</span>
                              <span>Scheduled : 25 Jun 2026 | 11:00 am</span>
                              <span className="text-slate-600">Naveen Naik</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Event 2 */}
                      <div className="relative">
                        <span className="absolute -left-[30px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-slate-400 shadow-sm" />
                        
                        <div className="space-y-2">
                          <span className="inline-block bg-[#0B2545] text-white text-[9.5px] font-bold px-2 py-0.5 rounded-md">
                            21 June 2026 | 08:21 pm
                          </span>
                          
                          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm space-y-2.5 text-slate-655 font-semibold leading-relaxed">
                            <p className="text-xs">
                              Details are shared with customer, expected site visit by next weekend. He will be in bengaluru by friday. Asked to follow up tomorrow.
                            </p>
                            <div className="flex justify-between items-center text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-bold">
                              <span className="text-slate-500">Reassigned &rarr; Call Back</span>
                              <span>Scheduled : 22 Jun 2026 | 11:20 am</span>
                              <span className="text-slate-600">Naveen Naik</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Event 3 */}
                      <div className="relative">
                        <span className="absolute -left-[30px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-slate-400 shadow-sm" />
                        
                        <div className="space-y-2">
                          <span className="inline-block bg-[#0B2545] text-white text-[9.5px] font-bold px-2 py-0.5 rounded-md">
                            20 June 2026 | 11:30 am
                          </span>
                          
                          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm space-y-2.5 text-slate-655 font-semibold leading-relaxed">
                            <p className="text-xs">
                              Lead interested in 2bhk under 1.5 Cr at Electronic City location. Prefer habulus oasis grove.
                            </p>
                            <div className="flex justify-between items-center text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-bold">
                              <span className="text-slate-500">Lead Captured &rarr; Reassigned</span>
                              <span className="text-slate-605">Santosh Ray</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Event 4 */}
                      <div className="relative">
                        <span className="absolute -left-[30px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-slate-400 shadow-sm" />
                        
                        <div className="space-y-2">
                          <span className="inline-block bg-[#0B2545] text-white text-[9.5px] font-bold px-2 py-0.5 rounded-md">
                            20 June 2026 | 11:18 am
                          </span>
                          
                          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm space-y-2.5 text-slate-655 font-semibold leading-relaxed">
                            <p className="text-xs">
                              Lead assigned to Santosh Ray.
                            </p>
                            <div className="flex justify-between items-center text-[9px] text-slate-400 pt-2 border-t border-slate-100 font-bold">
                              <span className="text-slate-505">Lead Captured</span>
                              <span className="text-slate-605 font-bold">Meta Ads</span>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
        {/* Settings slide-out drawer (Right side) */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden text-slate-700">
            {/* Backdrop */}
            <div 
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] transition-opacity cursor-pointer" 
            />

            <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
              <div className="w-screen max-w-md bg-white shadow-2xl relative flex flex-col p-8 overflow-y-auto rounded-l-2xl animate-slide-in space-y-6">
                
                {/* Header Close button */}
                <div className="flex justify-end border-b border-slate-100 pb-3 -mx-4 px-4">
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="text-slate-400 hover:text-slate-655 cursor-pointer p-1"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Settings Title */}
                <div>
                  <h3 className="text-2xl font-black text-slate-900">Settings</h3>
                </div>

                {/* Columns Header with Select All */}
                <div className="flex justify-between items-center text-xs font-bold text-slate-900 uppercase">
                  <span>Columns</span>
                  <button 
                    onClick={() => {
                      const allCols = [
                        "Date", "Property", "Reassigned To", "Source", "Lead Score", "Status", "Next Call Date", "Actions", "Ad Set Name", "Campaign", "Notes", "Property Match"
                      ];
                      if (selectedColumns.length === allCols.length) {
                        setSelectedColumns([]);
                      } else {
                        setSelectedColumns(allCols);
                      }
                    }}
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 cursor-pointer normal-case"
                  >
                    <span className="h-3.5 w-3.5 border border-slate-300 rounded flex items-center justify-center bg-slate-100/50">
                      {selectedColumns.length > 0 && <span className="h-1.5 w-1.5 bg-[#0B1E6E] rounded-sm" />}
                    </span>
                    Select All
                  </button>
                </div>

                {/* Columns Selection Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    "Date", "Property",
                    "Reassigned To", "Source",
                    "Lead Score", "Status",
                    "Next Call Date", "Actions",
                    "Ad Set Name", "Campaign",
                    "Notes", "Property Match"
                  ].map((col) => {
                    const isSelected = selectedColumns.includes(col);
                    return (
                      <button
                        key={col}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedColumns(prev => prev.filter(c => c !== col));
                          } else {
                            setSelectedColumns(prev => [...prev, col]);
                          }
                        }}
                        className={`flex items-center text-[11px] font-bold border border-slate-200 rounded-lg p-2.5 text-left cursor-pointer transition-all hover:bg-slate-50/50 ${
                          isSelected ? "border-l-4 border-l-[#0B1E6E] text-slate-900 bg-slate-50/20" : "text-slate-500 bg-white"
                        }`}
                      >
                        {col}
                      </button>
                    );
                  })}
                </div>

              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* Top Title Bar */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
            <Sliders className="h-6.5 w-6.5 text-brand-600" />
            CRM Lead Partition Management
          </h2>
          <p className="text-xs text-slate-500">Acquire, distribute, and audit property buyer lead pipelines.</p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-2 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-brand-700/10 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Lead
        </button>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 rounded-xl font-bold flex items-center gap-2 animate-fade-in shadow-sm">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Step 1: Top Metrics Summary Cards */}
      <TopMetricsCards
        totalLeads={totalLeadsSum}
        metaLeads={metaLeadsSum}
        googleLeads={googleLeadsSum}
        leadsToday={leadsToday}
        visitsToday={visitsToday}
        weekendVisits={weekendVisits}
        monthBookings={monthBookings}
        metaSubAccounts={metaSubAccounts}
        googleSubAccounts={googleSubAccounts}
        activeFilter={activeMetricFilter}
        onFilterChange={handleMetricFilterChange}
      />

      {/* Step 2: Search & scrollable Status Pool filters */}
      <LeadFilterBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedStatuses={selectedStatuses}
        setSelectedStatuses={setSelectedStatuses}
        availableStatuses={availableStatuses}
      />

      {/* Step 3: Core Leads Data Table */}
      <LeadTable
        leads={filteredLeads}
        onViewDetails={handleViewLeadDetails}
        onDelete={handleDeleteLead}
        activeRole={activeRole}
      />

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
        onReassignAgent={(leadId, agentName) => {
          showToast(`Successfully reassigned to ${agentName}`);
        }}
      />

      {/* Premium Centered Success Toast Card */}
      {toastMessage && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-5 shadow-2xl flex items-center gap-4 min-w-[320px] max-w-sm animate-scale-in">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 shrink-0">
            <Check className="h-5 w-5 stroke-[2.5]" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-wider">Lead Reassigned</h4>
            <p className="text-xs font-semibold text-slate-600 mt-0.5 truncate">{toastMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
