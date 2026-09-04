"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Building, MapPin, Phone, Users, Landmark, FileText, CheckCircle, HelpCircle } from "lucide-react";

export default function OrganizationPage() {
  const { users, properties, leads } = useApp();
  const [activeTab, setActiveTab] = useState("Organization Details");

  // No real subscription-billing/receipts data model exists yet (checkout/provisioning
  // only track seats + a paid/unpaid flag, not a payment history ledger) — shown
  // honestly empty rather than inventing a fake paid receipt.
  const billingHistory: { date: string; description: string; status: string; amount: string }[] = [];
  const totalReceipts = billingHistory.reduce((sum, b) => sum + Number(b.amount.replace(/[^0-9.]/g, "")), 0);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="glass-card p-6 sm:p-8 rounded-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-xl pointer-events-none" />
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700 font-extrabold text-sm">
            RV
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">Realhubb Ventures Private Limited</h2>
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold">Active</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Domain: <code>realhubb</code></p>
          </div>
        </div>

        <div className="flex gap-4 text-xs font-semibold text-slate-500">
          <div className="text-center px-4 py-2 border-r border-slate-200">
            <span className="block text-slate-400 text-[10px] uppercase font-bold">Total Users</span>
            <span className="text-base font-black text-slate-850">{users.length}</span>
          </div>
          <div className="text-center px-4 py-2 border-r border-slate-200">
            <span className="block text-slate-400 text-[10px] uppercase font-bold">Active Leads</span>
            <span className="text-base font-black text-slate-850">{leads.length}</span>
          </div>
          <div className="text-center px-4 py-2">
            <span className="block text-slate-400 text-[10px] uppercase font-bold">Properties</span>
            <span className="text-base font-black text-slate-850">{properties.length}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-bold text-slate-500 mb-6">
        {["Organization Details", "Billing History"].map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`pb-3 border-b-2 transition-all ${
              activeTab === t ? "border-brand-500 text-brand-700 font-black" : "border-transparent hover:text-slate-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "Organization Details" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in">
          {/* Details Table */}
          <div className="lg:col-span-8 glass-card p-6 rounded-2xl space-y-6">
            <h3 className="text-sm font-bold text-slate-700">Company Registry Parameters</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-1">
                <span className="text-slate-450 block font-semibold">Registered Company Name</span>
                <span className="text-slate-800 font-bold">Realhubb Ventures Private Limited</span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-450 block font-semibold">Company contact Number</span>
                <span className="text-slate-500 italic">Not configured</span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-450 block font-semibold">Contact Email ID</span>
                <span className="text-slate-500 italic">Not configured</span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-450 block font-semibold">RERA Registry Number</span>
                <span className="text-slate-500 italic">Not available</span>
              </div>

              <div className="col-span-2 space-y-1 border-t border-slate-200 pt-4">
                <span className="text-slate-450 block font-semibold">Registered HQ Address</span>
                <span className="text-slate-500 italic">Not configured</span>
              </div>
            </div>
          </div>

          {/* Right helper info */}
          <div className="lg:col-span-4 glass-card p-6 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold text-slate-750">SaaS Subscription Ledger</h3>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Receipt payments till date</span>
                <span className="font-bold text-slate-800 font-mono">₹{totalReceipts.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-emerald-600 font-bold">
                <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Tenant Billed</span>
                <span>Active subscription</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Billing History" && (
        <div className="glass-card p-6 rounded-2xl animate-fade-in">
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="p-4">Billing Date</th>
                    <th className="p-4">Description</th>
                    <th className="p-4">Paid Amount</th>
                    <th className="p-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {billingHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-400 font-semibold italic">
                        No billing history yet.
                      </td>
                    </tr>
                  ) : (
                    billingHistory.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-4 font-medium text-slate-700">{item.date}</td>
                        <td className="p-4 text-slate-500">{item.description}</td>
                        <td className="p-4 font-mono font-bold text-brand-700">{item.amount}</td>
                        <td className="p-4 text-right">
                          <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold">
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
