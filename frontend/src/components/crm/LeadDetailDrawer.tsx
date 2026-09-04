"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Phone, MessageSquare, Mail, Copy, Check, User, FileText, ChevronDown } from "lucide-react";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";

interface LeadDetailDrawerProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (leadId: string, status: LeadStatus) => void;
  onReassignAgent?: (leadId: string, agentName: string) => void;
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function LeadDetailDrawer({
  lead,
  isOpen,
  onClose,
  onUpdateStatus,
  onReassignAgent
}: LeadDetailDrawerProps) {
  const { users, reassignLead, currentUser, activeRole } = useApp();
  const [localStatus, setLocalStatus] = useState<LeadStatus>("New Lead");
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [reassignedAgent, setReassignedAgent] = useState<string>("");

  // Who this lead can be handed to — mirrors the server-side check in
  // leads.service.ts (ADMIN: anyone; Manager: own direct reports; Member:
  // teammates under the same manager), so the dropdown never offers a name
  // the backend would reject, and never includes anyone who isn't a real
  // user account. A prior version of this component appended 8 hardcoded
  // fake names here — selecting one looked like it worked (local state
  // mutated, a notification fired) but silently never reached the database,
  // since reassignLead() only calls the real API when the target name
  // resolves to an actual user.
  const reassignTargets = useMemo(() => {
    if (!currentUser) return [];
    const others = users.filter(u => u.name !== lead?.assignedAgent);
    if (activeRole === "ADMIN") return others;
    if (currentUser.role_type === "Manager") {
      return others.filter(u => u.managerId === currentUser.id);
    }
    if (!currentUser.managerId) return [];
    return others.filter(u => u.id === currentUser.managerId || u.managerId === currentUser.managerId);
  }, [users, currentUser, activeRole, lead?.assignedAgent]);

  useEffect(() => {
    if (lead) {
      setLocalStatus(lead.status);
      setReassignedAgent("");
    }
  }, [lead]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !lead) return null;

  const handleStatusChange = (newStatus: LeadStatus) => {
    setLocalStatus(newStatus);
    onUpdateStatus(lead.id, newStatus);
  };

  const handleReassign = (newAgent: string) => {
    if (!newAgent) return;
    setReassignedAgent(newAgent);
    reassignLead(lead.id, newAgent);
    onReassignAgent?.(lead.id, newAgent);
  };

  const copyPhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(lead.phone);
    }
    setPhoneCopied(true);
    setTimeout(() => setPhoneCopied(false), 2000);
  };

  const copyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lead.email && navigator.clipboard) {
      navigator.clipboard.writeText(lead.email);
    }
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const leadEmail = lead.email || "";
  const assignedAgentName = lead.assignedAgent || "Unassigned";
  const propertyName = lead.property || "Not set";
  const capturedAtStr = formatDateTime(lead.createdAtStr);
  const leadSource = lead.source || lead.campaign || "Direct / Manual Entry";

  // Real activity timeline, most-recent first — the prior version of this
  // component rendered a hardcoded mockActivityLogs array here instead of
  // the lead's own logs, showing identical fabricated conversation history
  // for every lead regardless of what actually happened.
  const sortedLogs = [...(lead.logs || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const lastUpdatedStr = sortedLogs.length > 0 ? formatDateTime(sortedLogs[0].timestamp) : capturedAtStr;

  const drawerContent = (
    <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
      {/* Invisible Click Backdrop (No dark/grey transparent layer) */}
      <div
        className="fixed inset-0 bg-transparent pointer-events-auto cursor-pointer"
        onClick={onClose}
      />

      {/* Right Side Slide-Over Drawer Container - Smooth Scrollable Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 z-10 pointer-events-auto">
        <div className="w-screen max-w-[450px] h-full bg-white shadow-2xl relative flex flex-col p-6 space-y-4 overflow-y-auto animate-slide-in rounded-l-3xl border-l border-slate-100">

          {/* Top Right Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-full hover:bg-slate-100"
          >
            <X className="h-4.5 w-4.5" />
          </button>

          {/* Lead Name Title */}
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{lead.name}</h2>

            {/* Phone & Email Row */}
            <div className="mt-1.5 space-y-1 text-xs text-slate-700">
              <div className="flex items-center gap-1.5">
                <a
                  href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-800 hover:text-emerald-600 transition-colors"
                  title="WhatsApp"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-slate-800" />
                </a>
                <a href={`tel:${lead.phone}`} className="text-slate-800 hover:text-blue-600">
                  <Phone className="h-3.5 w-3.5 text-slate-800" />
                </a>
                <span className="font-semibold text-slate-800">{lead.phone}</span>
                <button
                  onClick={copyPhone}
                  className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer bg-transparent border-none"
                  title="Copy phone"
                >
                  {phoneCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-800" />
                {leadEmail ? (
                  <>
                    <a href={`mailto:${leadEmail}`} className="font-semibold text-slate-800 underline hover:text-blue-600">
                      {leadEmail}
                    </a>
                    <button
                      onClick={copyEmail}
                      className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer bg-transparent border-none"
                      title="Copy email"
                    >
                      {emailCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </>
                ) : (
                  <span className="text-slate-400 italic font-medium">Not provided</span>
                )}
              </div>
            </div>
          </div>

          {/* Current Status & Notes Toolbar */}
          <div className="flex justify-between items-center pt-0.5">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-bold text-slate-900">Current Status :</span>
              <div className="relative inline-block">
                <select
                  value={localStatus}
                  onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                  className="bg-[#FFF9E6] border border-[#FFE082] rounded-full px-2.5 py-0.5 text-xs font-bold text-[#B78103] focus:outline-none appearance-none pr-5 cursor-pointer"
                >
                  <option value="RNR">RNR</option>
                  <option value="New Lead">New Lead</option>
                  <option value="Call Back">Call Back</option>
                  <option value="Follow-ups">Follow Up</option>
                  <option value="Visit Schedule">Visit Schedule</option>
                  <option value="Site Visit">Site Visit</option>
                  <option value="Booked">Booked</option>
                  <option value="Not Interested">Not Interested</option>
                </select>
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#B78103] text-[7px] pointer-events-none">▼</span>
              </div>
            </div>

            <div className="relative">
              <button
                onClick={() => setIsNotesOpen(!isNotesOpen)}
                className="flex items-center gap-1 border border-slate-200/90 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <FileText className="h-3.5 w-3.5 text-slate-600" />
                <span>Notes</span>
                <span className="text-[7px]">▼</span>
              </button>
              {isNotesOpen && (
                <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2.5 text-xs text-slate-700 space-y-1">
                  <p className="font-bold text-slate-800 border-b border-slate-100 pb-1 text-[11px]">Latest Note</p>
                  <p className="text-slate-600 text-[10px] leading-relaxed">
                    {sortedLogs[0]?.message || "No notes recorded yet."}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sub-header Metadata Row */}
          <div className="flex justify-between items-center text-[10px] text-slate-400 pb-1 border-b border-slate-100">
            <div>
              <span className="font-semibold text-slate-400">Last Updated : </span>
              <span className="font-medium text-slate-600">{lastUpdatedStr}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-slate-400">Source : </span>
              <span className="text-blue-600 font-bold text-[10px] truncate max-w-[140px]" title={leadSource}>{leadSource}</span>
            </div>
          </div>

          {/* 2-Column Key Value Details */}
          <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs font-semibold text-slate-800 pt-0.5">
            <div>
              <span className="font-black text-slate-900 block mb-0.5">Assigned To :</span>
              <div className="flex items-center gap-1.5 text-slate-700">
                <User className="h-3.5 w-3.5 text-slate-600" />
                <span className="text-xs">{assignedAgentName}</span>
              </div>
            </div>
            <div>
              <span className="font-black text-slate-900 block mb-0.5">Property :</span>
              <span className="text-slate-700 text-xs">{propertyName}</span>
            </div>
            <div>
              <span className="font-black text-slate-900 block mb-0.5">Reassign To :</span>
              <div className="relative inline-block mt-0.5">
                <select
                  value={reassignedAgent}
                  onChange={(e) => handleReassign(e.target.value)}
                  className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 cursor-pointer pr-6 shadow-2xs"
                >
                  <option value="">
                    {reassignTargets.length === 0 ? "No eligible agents" : "Select agent…"}
                  </option>
                  {reassignTargets.map(agent => (
                    <option key={agent.id} value={agent.name}>{agent.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 h-3 w-3 pointer-events-none" />
              </div>
            </div>
            <div>
              <span className="font-black text-slate-900 block mb-0.5">Captured at :</span>
              <span className="text-slate-700 text-xs">{capturedAtStr}</span>
            </div>
          </div>

          {/* Activity History Section */}
          <div className="space-y-2.5 pt-2">
            <h3 className="text-xs font-black text-slate-900">Activity History :</h3>

            {/* Timeline Scrollable Box — real lead.logs, most recent first */}
            <div className="rounded-2xl border border-slate-200/90 p-4 bg-slate-50/20 overflow-y-auto space-y-4 max-h-[380px]">
              {sortedLogs.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic text-center py-4">No activity recorded yet.</p>
              ) : (
                <div className="relative border-l-2 border-slate-300 ml-3 pl-6 space-y-5">
                  {sortedLogs.map((log, idx) => (
                    <div key={`${log.timestamp}-${idx}`} className="relative">
                      {/* Circle Node Dot */}
                      <span className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-slate-400 bg-white" />

                      {/* Date Pill Badge */}
                      <div className="inline-block bg-[#0B1E6E] text-white text-[10px] font-bold px-3 py-0.5 rounded-md mb-2 shadow-2xs">
                        {formatDateTime(log.timestamp)}
                      </div>

                      {/* Message Bubble Card */}
                      <div className="bg-[#EBF7FE] border border-[#BBE2FB] rounded-xl p-3.5 space-y-3 shadow-2xs">
                        <p className="text-xs font-medium text-slate-800 leading-relaxed">
                          {log.message}
                        </p>
                        <div className="flex justify-end items-center text-[9px] text-slate-400 pt-1.5 border-t border-[#D0E9FA] font-medium">
                          <span>{log.user}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );

  // Rendered via a portal straight into <body> — this drawer is rendered as
  // a descendant of pages whose outer wrapper carries the `animate-fade-in`
  // utility (LeadDashboard.tsx, AdminCrmDashboard.tsx, LeadDashboardClassic.tsx
  // all still do). That class's keyframes end on a lingering
  // `transform: translateY(0)` (animation-fill-mode: both) which — even
  // though visually a no-op — makes that ancestor the containing block for
  // any `position: fixed` descendant, breaking true-viewport positioning. A
  // portal escapes that ancestor entirely; see AddLeadModal.tsx for the same
  // fix applied the same way.
  return createPortal(drawerContent, document.body);
}
