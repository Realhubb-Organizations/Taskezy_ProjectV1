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
    <div className="space-y-8 pb-12 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
          <DollarSign className="h-6.5 w-6.5 text-brand-600" />
          Finance Operations Cockpit
        </h2>
        <p className="text-xs text-slate-500">Corporate invoices, GST ledgers, and expense claim reimbursement systems.</p>
      </div>

      {/* Finance Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Invoiced Amount</span>
            <p className="text-xl font-black text-slate-800">₹{totalInvoiced.toLocaleString()}</p>
            <span className="text-[9px] text-slate-400 block mt-1">Includes 18% CGST + SGST</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
            <DollarSign className="h-5.5 w-5.5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Reimbursement Claims</span>
            <p className="text-xl font-black text-amber-600">{pendingClaimsCount} claims</p>
            <span className="text-[9px] text-slate-450 block mt-1">Requires review</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <FileText className="h-5.5 w-5.5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Booking Reviews</span>
            <p className="text-xl font-black text-brand-700">{pendingFinanceReview} bookings</p>
            <span className="text-[9px] text-slate-450 block mt-1">Awaiting GST invoice generation</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-brand-700">
            <CheckCircle className="h-5.5 w-5.5" />
          </div>
        </div>
      </div>

      {/* Finance Actions Info */}
      <div className="glass-card p-6 rounded-2xl bg-brand-50/10 border border-brand-200 space-y-3">
        <h3 className="text-xs font-bold text-brand-850 flex items-center gap-1.5">
          <Lock className="h-4.5 w-4.5 text-brand-600" />
          Isolated Finance Boundary
        </h3>
        <p className="text-xs text-slate-650 leading-relaxed">
          As a member of the Finance department, your account boundary is restricted exclusively to financial telemetry, invoice dispatching, and reimbursement claim governance. Other business lines (CRM pipelines, HRMS geofencing) are blocked.
        </p>
      </div>
    </div>
  );
}
