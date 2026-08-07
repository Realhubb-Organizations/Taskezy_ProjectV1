"use client";

import React, { useState } from "react";
import { useApp, Invoice, ReimbursementClaim, Lead, CalendarEventType } from "@/context/AppContext";
import { useSearchParams } from "next/navigation";
import MonthCalendar from "@/components/calendar/MonthCalendar";
import AddCalendarEventModal from "@/components/calendar/AddCalendarEventModal";
import {
  CreditCard,
  DollarSign,
  FileText,
  CheckCircle,
  XCircle,
  HelpCircle,
  Percent,
  Plus,
  X,
  Search,
  Check,
  ShieldAlert,
  Trash2,
  CalendarDays
} from "lucide-react";

export default function FinancePage() {
  const {
    invoices,
    reimbursements,
    leads,
    approveClaim,
    rejectClaim,
    markInvoicePaid,
    updateLeadStatus,
    addInvoice,
    generateInvoice,
    deleteInvoice,
    deleteClaim,
    activeRole,
    calendarEvents,
    addCalendarEvent
  } = useApp();

  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get("tab") || "dashboard";

  // Reimbursement filters
  const [reimbFilter, setReimbFilter] = useState("All");

  // Invoices list state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // New Invoice form state
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [projectName, setProjectName] = useState("");
  const [leadId, setLeadId] = useState("");
  const [newInvoiceError, setNewInvoiceError] = useState("");

  // Calendar tab state
  const todayStr0 = new Date().toISOString().split("T")[0];
  const [selectedCalDate, setSelectedCalDate] = useState<string>(todayStr0);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const financeEvents = calendarEvents.filter(e => e.system === "FINANCE");
  const dayFinanceEvents = financeEvents.filter(e => e.date === selectedCalDate);

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    setNewInvoiceError("");
    if (!clientName || !baseAmount || !leadId) {
      setNewInvoiceError("Client name, base value, and an associated lead are all required.");
      return;
    }

    const result = addInvoice(leadId, clientName, Number(baseAmount), projectName || undefined);
    if (!result.success) {
      setNewInvoiceError(result.error || "Could not create invoice.");
      return;
    }
    setIsNewInvoiceOpen(false);
    setClientName("");
    setBaseAmount("");
    setProjectName("");
    setLeadId("");
  };

  const handleApproveBooking = (leadId: string) => {
    updateLeadStatus(leadId, "Booking Approved");
    // Find associated draft invoice and activate it
    const associatedInvoice = invoices.find(inv => inv.leadId === leadId);
    if (associatedInvoice) {
      generateInvoice(associatedInvoice.id);
    }
  };

  const handleRejectBooking = (leadId: string) => {
    updateLeadStatus(leadId, "Finance Rejected");
  };

  const handleDeleteInvoice = (id: string) => {
    if (confirm("Are you sure you want to delete this invoice ledger?")) {
      deleteInvoice(id);
    }
  };

  const filteredReimbursements = reimbursements.filter(r => {
    if (reimbFilter === "All") return true;
    return r.status === reimbFilter;
  });

  // Calculate stats
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const pendingApprovals = leads.filter(l => l.status === "Booking Done" || l.status === "Finance Review");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
            <CreditCard className="h-5.5 w-5.5 text-brand-650" />
            Finance Operations
          </h2>
          <p className="text-xs text-slate-500">
            Generate tax ledgers, inspect fuel/mobile reimbursements, and release bookings.
          </p>
        </div>

        {activeTabParam === "billing" && (
          <button
            onClick={() => setIsNewInvoiceOpen(true)}
            className="inline-flex items-center gap-1.5 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md shadow-brand-700/10"
          >
            <Plus className="h-4 w-4" />
            Create Invoice Ledger
          </button>
        )}

        {activeTabParam === "calendar" && (
          <button
            onClick={() => setIsAddEventOpen(true)}
            className="inline-flex items-center gap-1.5 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md shadow-brand-700/10"
          >
            <Plus className="h-4 w-4" />
            Add Reminder / Task
          </button>
        )}
      </div>

      {/* 1. Billing Tab */}
      {activeTabParam === "billing" && (
        <div className="glass-card p-6 rounded-2xl space-y-6 animate-fade-in">
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="p-4">Invoice ID</th>
                    <th className="p-4">Client Name</th>
                    <th className="p-4">Project</th>
                    <th className="p-4">Base Amount</th>
                    <th className="p-4">Tax (18% GST)</th>
                    <th className="p-4">Total Amount</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50">
                      <td className="p-4 font-mono font-bold text-brand-700">{inv.invoiceNumber || "Draft (Pending)"}</td>
                      <td className="p-4 font-bold text-slate-800">{inv.clientName}</td>
                      <td className="p-4 text-slate-500">{inv.projectName || "N/A"}</td>
                      <td className="p-4 font-mono">₹{inv.baseAmount.toLocaleString("en-IN")}</td>
                      <td className="p-4 font-mono text-slate-500">₹{(inv.cgst + inv.sgst).toLocaleString("en-IN")}</td>
                      <td className="p-4 font-mono text-slate-805">₹{inv.totalAmount.toLocaleString("en-IN")}</td>
                      <td className="p-4">
                        <span className={`inline-block border px-2 py-0.5 rounded text-[10px] font-bold ${
                          inv.status === "Paid"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-amber-50 text-amber-700 border-amber-100"
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {inv.status !== "Paid" ? (
                          <button
                            onClick={() => {
                              if (inv.invoiceNumber) {
                                markInvoicePaid(inv.id);
                              } else {
                                generateInvoice(inv.id);
                              }
                            }}
                            className="px-2.5 py-1 rounded bg-brand-50 border border-brand-200 text-brand-700 text-[10px] font-bold hover:bg-brand-700 hover:text-white transition-all"
                          >
                            {inv.invoiceNumber ? "Collect Payment" : "Activate Invoice"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-450 italic">Fully Settled</span>
                        )}
                        {activeRole === "ADMIN" && (
                          <button
                            onClick={() => handleDeleteInvoice(inv.id)}
                            className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 border border-red-200 text-red-750 text-[10px] font-bold transition-all inline-flex items-center gap-0.5"
                            title="Delete invoice entry"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. Reimbursements Tab */}
      {activeTabParam === "reimbursements" && (
        <div className="glass-card p-6 rounded-2xl space-y-6 animate-fade-in">
          {/* Filter */}
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-700">Receipt Expense Ledger</h3>
            <div className="flex gap-2">
              {["All", "Pending", "Paid", "Rejected"].map(status => (
                <button
                  key={status}
                  onClick={() => setReimbFilter(status)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                    reimbFilter === status
                      ? "bg-brand-50 border-brand-200 text-brand-700"
                      : "bg-white border-slate-200 text-slate-500 hover:text-slate-750"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-slate-205 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="p-4">Submission Date</th>
                    <th className="p-4">Agent Name</th>
                    <th className="p-4">Claim Purpose</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {filteredReimbursements.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="p-4 text-slate-500 font-mono">{c.date}</td>
                      <td className="p-4 font-bold text-slate-800">{c.agentName}</td>
                      <td className="p-4">
                        <p className="text-slate-850 font-bold">{c.title}</p>
                        {c.notes && <p className="text-[10px] text-slate-450 mt-0.5">{c.notes}</p>}
                      </td>
                      <td className="p-4 text-slate-500">{c.type}</td>
                      <td className="p-4 font-mono font-bold text-slate-800">₹{c.amount.toLocaleString("en-IN")}</td>
                      <td className="p-4">
                        <span className={`inline-block border px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.status === "Paid"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : c.status === "Rejected"
                            ? "bg-red-50 text-red-700 border-red-100"
                            : "bg-amber-50 text-amber-700 border-amber-100"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex gap-2 justify-end items-center">
                          {c.status === "Pending" ? (
                            <>
                              <button
                                onClick={() => approveClaim(c.id)}
                                className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700"
                                title="Release reimbursement claim"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => rejectClaim(c.id)}
                                className="p-1 rounded bg-red-50 hover:bg-red-100 border border-red-200 text-red-700"
                                title="Reject claim"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-450 italic">Closed</span>
                          )}
                          {activeRole === "ADMIN" && (
                            <button
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this claim?")) {
                                  deleteClaim(c.id);
                                }
                              }}
                              className="p-1 rounded bg-red-50 hover:bg-red-100 border border-red-200 text-red-750"
                              title="Delete claim entry"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Finance Calendar tab */}
      {activeTabParam === "calendar" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Payment Reminder", color: "bg-sky-500" },
              { label: "Task", color: "bg-orange-500" }
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                <span className={`h-2 w-2 rounded-full ${item.color}`} />
                {item.label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8">
              <MonthCalendar
                events={financeEvents}
                selectedDate={selectedCalDate}
                onSelectDate={setSelectedCalDate}
                colorForEvent={(e) => (e.type === "PAYMENT_REMINDER" ? "bg-sky-500" : "bg-orange-500")}
              />
            </div>

            <div className="lg:col-span-4 glass-card p-5 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-2">
                {new Date(selectedCalDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </h3>
              {dayFinanceEvents.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic py-4 text-center">No reminders or tasks scheduled on this date.</p>
              ) : (
                <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
                  {dayFinanceEvents.map(e => (
                    <div key={e.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-800">{e.title}</p>
                        <span
                          className={`text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            e.type === "PAYMENT_REMINDER"
                              ? "bg-sky-50 text-sky-700 border border-sky-100"
                              : "bg-orange-50 text-orange-700 border border-orange-100"
                          }`}
                        >
                          {e.type === "PAYMENT_REMINDER" ? "REMINDER" : "TASK"}
                        </span>
                      </div>
                      {e.time && <p className="text-[10px] text-slate-500 font-mono mt-1">{e.time}</p>}
                      {e.description && <p className="text-[10px] text-slate-500 mt-1">{e.description}</p>}
                      {typeof e.amount === "number" && (
                        <p className="text-[10px] text-slate-700 font-bold font-mono mt-1">₹{e.amount.toLocaleString("en-IN")}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Finance Dashboard Tab */}
      {activeTabParam === "dashboard" && (
        <div className="space-y-6 animate-fade-in">
          {/* Counters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Completed Revenue</span>
                <p className="text-xl font-black text-slate-800">
                  ₹{invoices.filter(i => i.status === "Paid").reduce((sum, i) => sum + i.totalAmount, 0).toLocaleString("en-IN")}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <DollarSign className="h-5.5 w-5.5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Draft/Pending Invoices</span>
                <p className="text-xl font-black text-slate-800">
                  {invoices.filter(i => i.status !== "Paid").length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                <FileText className="h-5.5 w-5.5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Bookings</span>
                <p className="text-xl font-black text-slate-850">
                  {pendingApprovals.length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-650">
                <ShieldAlert className="h-5.5 w-5.5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Unpaid Claims</span>
                <p className="text-xl font-black text-red-600">
                  ₹{reimbursements.filter(r => r.status === "Pending").reduce((sum, r) => sum + r.amount, 0).toLocaleString("en-IN")}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-50 border border-red-105 flex items-center justify-center text-red-600">
                <CreditCard className="h-5.5 w-5.5" />
              </div>
            </div>
          </div>

          {/* Pending Bookings Roster */}
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ShieldAlert className="h-4.5 w-4.5 text-slate-500" />
                Pending Booking Signoffs (Requires KYC Validation &amp; Tax Activation)
              </h3>
              <span className="text-[9px] bg-indigo-50 border border-indigo-150 text-indigo-700 px-2 py-0.5 rounded font-black">
                Gated DAG Check
              </span>
            </div>

            <div className="space-y-3">
              {pendingApprovals.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  All customer bookings are fully verified, tax incepted, and matching in the system.
                </div>
              ) : (
                pendingApprovals.map((l) => (
                  <div key={l.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{l.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">+91-{l.phone} • {l.email}</p>
                      <div className="flex gap-2 mt-2">
                        <span className="bg-brand-50 border border-brand-100 text-brand-700 px-1.5 py-0.5 rounded text-[9px] font-bold">
                          Property: {l.property || "Granada"}
                        </span>
                        <span className="bg-slate-200 border border-slate-250 text-slate-700 px-1.5 py-0.5 rounded text-[9px] font-bold">
                          Draft Value: ₹{(l.dealValue || 12000000).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 sm:justify-end">
                      <button
                        onClick={() => handleApproveBooking(l.id)}
                        className="px-3 py-1.5 rounded bg-emerald-650 text-white hover:bg-emerald-600 text-[10px] font-bold shadow-sm"
                      >
                        Approve Booking &amp; Activate Invoice
                      </button>
                      <button
                        onClick={() => handleRejectBooking(l.id)}
                        className="px-3 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {isNewInvoiceOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30" onClick={() => setIsNewInvoiceOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-slate-200 p-6 rounded-2xl shadow-2xl z-40 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-brand-700">Create Tax Invoice Ledger</h3>
              <button onClick={() => setIsNewInvoiceOpen(false)} className="text-slate-400 hover:text-slate-655">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-4">
              {newInvoiceError && (
                <p className="text-[10px] text-red-600 font-bold bg-red-50 border border-red-150 rounded-lg px-3 py-2">{newInvoiceError}</p>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Lead</label>
                <select
                  required
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                >
                  <option value="">Select the lead this invoice is for…</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>{l.name} — {l.phone}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Client Name</label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Priya Arvind"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Base Value (INR)</label>
                <input
                  type="number"
                  required
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  placeholder="15000000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Project / Property</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Altura"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-brand-700 hover:bg-brand-600 text-white font-bold py-2.5 rounded-lg text-xs transition-all shadow-sm"
              >
                Ingest Invoice
              </button>
            </form>
          </div>
        </>
      )}

      {/* Add Finance Calendar Reminder/Task Modal */}
      <AddCalendarEventModal
        isOpen={isAddEventOpen}
        onClose={() => setIsAddEventOpen(false)}
        heading="Add Payment Reminder / Task"
        showAmount
        typeOptions={[
          { value: "PAYMENT_REMINDER" as CalendarEventType, label: "Payment Reminder" },
          { value: "TASK" as CalendarEventType, label: "Task" }
        ]}
        onSubmit={(data) => {
          addCalendarEvent({
            system: "FINANCE",
            type: data.type,
            title: data.title,
            date: data.date,
            time: data.time,
            description: data.description,
            amount: data.amount
          });
          setIsAddEventOpen(false);
        }}
      />
    </div>
  );
}
