import React, { useState } from "react";
import { DollarSign, FileText, CheckCircle, Search, Filter, RefreshCw, Layers } from "lucide-react";
import SubActionsMenu, { ActionItem } from "./SubActionsMenu";
import { useRouter } from "next/navigation";
import { Invoice, Property } from "@/context/AppContext";

interface FinanceAuditProps {
  invoices: Invoice[];
  pendingClaimsCount: number;
  pendingFinanceReview: number;
  properties: Property[];
}

function formatCurrency(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function FinanceAudit({
  invoices,
  pendingClaimsCount,
  pendingFinanceReview,
  properties
}: FinanceAuditProps) {
  const router = useRouter();

  // Filters State
  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const handleWidgetRedirect = () => {
    router.push("/dashboard/finance");
  };

  const getSubActions = (): ActionItem[] => [
    { label: "View Finance Portal", href: "/dashboard/finance" },
    { label: "Create GST Invoice", onClick: () => alert("Redirecting to invoice builder...") },
    { label: "Export Audit Ledger", onClick: () => alert("Exporting billing logs ledger...") }
  ];

  // Dynamic filter logic
  const filteredInvoices = invoices.filter(inv => {
    const matchesProject = selectedProject === "All" || 
      inv.projectName?.toLowerCase() === selectedProject.toLowerCase() ||
      inv.developerName?.toLowerCase() === selectedProject.toLowerCase() ||
      (inv as any).property?.toLowerCase() === selectedProject.toLowerCase(); // fallback check

    const matchesStatus = selectedStatus === "All" || inv.status.toLowerCase() === selectedStatus.toLowerCase();
    
    const matchesSearch = searchQuery === "" || 
      inv.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      inv.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesProject && matchesStatus && matchesSearch;
  });

  const totalBillingFiltered = filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  // Extract unique projects/developers for filter dropdown
  const projectList = ["All", ...Array.from(new Set(properties.map(p => p.name)))];

  return (
    <div
      onClick={handleWidgetRedirect}
      className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative h-full space-y-4 animate-fade-in"
    >
      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-705 flex items-center gap-2">
            <DollarSign className="h-4.5 w-4.5 text-emerald-600" />
            Finance Audit &amp; Billing Logs
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Corporate invoices ledger, reimbursement claims, and audit governance.</p>
        </div>
        <SubActionsMenu actions={getSubActions()} />
      </div>

      {/* Financial Counters Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[9px] uppercase font-extrabold">Pending Claims</span>
            <span className="text-base font-black text-amber-700 mt-1 block">{pendingClaimsCount} claims</span>
          </div>
          <div className="h-8 w-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <FileText className="h-4 w-4" />
          </div>
        </div>
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[9px] uppercase font-extrabold">Finance Reviews</span>
            <span className="text-base font-black text-brand-700 mt-1 block">{pendingFinanceReview} bookings</span>
          </div>
          <div className="h-8 w-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-brand-650">
            <CheckCircle className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Filter-wise Booking Section */}
      <div className="pt-3 border-t border-slate-100 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Filter-wise Bookings</span>
          <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">
            Sum: ₹{formatCurrency(totalBillingFiltered)}
          </span>
        </div>

        {/* Filter Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Project Filter */}
          <div className="space-y-1">
            <label className="block text-[8px] font-bold text-slate-400 uppercase">Project</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-[9px] font-bold text-slate-700 focus:outline-none"
            >
              {projectList.map(proj => (
                <option key={proj} value={proj}>{proj}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <label className="block text-[8px] font-bold text-slate-400 uppercase">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-[9px] font-bold text-slate-700 focus:outline-none"
            >
              <option value="All">All</option>
              <option value="Paid">Paid</option>
              <option value="Draft">Draft</option>
              <option value="Overdue">Overdue</option>
            </select>
          </div>

          {/* Text Search */}
          <div className="space-y-1">
            <label className="block text-[8px] font-bold text-slate-400 uppercase">Search Client</label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name/Inv..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-5 pr-2 py-1 text-[9px] font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-brand-500 transition-colors"
              />
              <Search className="absolute left-1.5 top-1.5 h-2.5 w-2.5 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-40 overflow-y-auto">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-extrabold text-slate-500 tracking-wider">
                <th className="p-2.5">Invoice ID</th>
                <th className="p-2.5">Client Name</th>
                <th className="p-2.5 text-right">GST Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-slate-400 font-medium italic text-[10px]">
                    No matching invoice records.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-2.5 text-slate-550 font-mono text-[10px]">{inv.invoiceNumber || "Draft ID"}</td>
                    <td className="p-2.5 text-slate-800 text-[10px]">{inv.clientName}</td>
                    <td className="p-2.5 text-right text-emerald-650 text-[10px]">₹{formatCurrency(inv.totalAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
