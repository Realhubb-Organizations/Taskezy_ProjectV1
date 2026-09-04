"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { DollarSign, FileText, CheckCircle, Lock } from "lucide-react";

// Finance's own overview — moved out of the old bare /dashboard route (which
// branched its content by department/activeSystem, so the same URL showed a
// different page depending on runtime state) into its own real path,
// alongside /crm/dashboard and /hrms/dashboard.
export default function FinanceDashboardPage() {
  const { invoices, reimbursements, leads } = useApp();

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const pendingClaimsCount = reimbursements.filter(r => r.status === "Pending").length;
  const pendingFinanceReview = leads.filter(l => l.status === "Finance Review" || l.status === "Booking Done").length;

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <div>
        <h2 className="text-sm font-bold text-brand-700 flex items-center gap-1.5">
          <DollarSign className="h-4 w-4 text-brand-600" />
          Finance Operations Cockpit
        </h2>
        <p className="text-xs text-slate-500">Corporate invoices, GST ledgers, and expense claim reimbursement systems.</p>
      </div>

      {/* Finance Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Invoiced Amount</span>
            <p className="text-base font-black text-slate-800">₹{totalInvoiced.toLocaleString()}</p>
            <span className="text-[9px] text-slate-400 block mt-1">Includes 18% CGST + SGST</span>
          </div>
          <div className="h-8 w-8 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            <DollarSign className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Reimbursement Claims</span>
            <p className="text-base font-black text-amber-600">{pendingClaimsCount} claims</p>
            <span className="text-[9px] text-slate-450 block mt-1">Requires review</span>
          </div>
          <div className="h-8 w-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <FileText className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Booking Reviews</span>
            <p className="text-base font-black text-brand-700">{pendingFinanceReview} bookings</p>
            <span className="text-[9px] text-slate-450 block mt-1">Awaiting GST invoice generation</span>
          </div>
          <div className="h-8 w-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-brand-700 shrink-0">
            <CheckCircle className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Finance Actions Info */}
      <div className="glass-card p-4 rounded-2xl bg-brand-50/10 border border-brand-200 space-y-2">
        <h3 className="text-xs font-bold text-brand-850 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-brand-600" />
          Isolated Finance Boundary
        </h3>
        <p className="text-xs text-slate-650 leading-relaxed">
          As a member of the Finance department, your account boundary is restricted exclusively to financial telemetry, invoice dispatching, and reimbursement claim governance. Other business lines (CRM pipelines, HRMS geofencing) are blocked.
        </p>
      </div>
    </div>
  );
}
