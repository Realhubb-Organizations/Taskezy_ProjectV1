import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Phone, MessageSquare, Mail, Share2, Calendar, ArrowRight, Bell, Repeat, ChevronDown, Search, Copy, Check, User } from "lucide-react";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";
import { deriveActivityTimeline, STATUS_OPTIONS, statusBadgeClasses } from "@/lib/leadStatusMapping";

interface LeadDetailDrawerProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (leadId: string, status: LeadStatus) => void;
}

export default function LeadDetailDrawer({
  lead,
  isOpen,
  onClose,
  onUpdateStatus
}: LeadDetailDrawerProps) {
  const { addNotification, addCalendarEvent, addFollowupCall, users, currentUser, activeRole, reassignLead } = useApp();
  const [localStatus, setLocalStatus] = useState<LeadStatus>("New Lead");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminderSet, setReminderSet] = useState(false);
  const [reassignTarget, setReassignTarget] = useState("");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [statusMenuPos, setStatusMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [statusSearch, setStatusSearch] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Who this lead can be handed to: ADMIN can reassign to anyone; a Manager
  // can only reassign within their own direct reports; a Member can only
  // reassign to a teammate under their own manager (or to that manager) —
  // mirrors the server-side check in leads.service.ts, which is what
  // actually enforces this (this list is just so the picker doesn't offer
  // choices that would come back a 403).
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
      setReminderDate("");
      setReminderTime("");
      setReminderSet(false);
      setStatusMenuOpen(false);
      setCopiedField(null);
    }
  }, [lead]);

  if (!isOpen || !lead) return null;

  const handleSelectStatus = (nextStatus: LeadStatus) => {
    setLocalStatus(nextStatus);
    onUpdateStatus(lead.id, nextStatus);
    setStatusMenuOpen(false);
  };

  const statusOptionsList = STATUS_OPTIONS.includes(localStatus) ? STATUS_OPTIONS : [localStatus, ...STATUS_OPTIONS];
  const statusQuery = statusSearch.trim().toLowerCase();
  const filteredStatusOptions = statusQuery
    ? statusOptionsList.filter(s => s.toLowerCase().includes(statusQuery))
    : statusOptionsList;

  const handleSaveReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderDate || !reminderTime) {
      alert("Please select both Date and Time for the reminder.");
      return;
    }
    // API Integration Point: Save calendar task/reminder event details
    setReminderSet(true);
    const isSiteVisit =
      localStatus === "Visit Schedule" ||
      localStatus === "Site Visit" ||
      localStatus === "Site Visit Scheduled" ||
      localStatus === "Meeting Scheduled";

    addNotification({
      system: "CRM",
      category: "REMINDER",
      title: `${localStatus} Reminder Set`,
      message: `${lead.name} • ${reminderDate} at ${reminderTime}`,
      leadId: lead.id
    });
    addCalendarEvent({
      system: "CRM",
      type: isSiteVisit ? "SITE_VISIT" : "FOLLOWUP",
      title: `${localStatus} — ${lead.name}`,
      date: reminderDate,
      time: reminderTime,
      description: `${lead.property || "Property"} • ${lead.phone}`,
      leadId: lead.id
    });
    addFollowupCall({
      scheduledAt: new Date(`${reminderDate}T${reminderTime}`).toISOString(),
      leadId: lead.id,
      leadName: lead.name,
      phone: lead.phone,
      // isSiteVisit already covers "Meeting Scheduled" (see above), matching the SITE_VISIT calendar event type used for it.
      callType: isSiteVisit ? "SITE_VISIT" : "CALLBACK",
      assignedToName: lead.assignedAgent
    });
    alert(`Calendar Task Saved!\nLead: ${lead.name}\nStatus: ${localStatus}\nDate: ${reminderDate}\nTime: ${reminderTime}\nNotification scheduled.`);
  };

  const handleReassign = () => {
    if (!reassignTarget) return;
    reassignLead(lead.id, reassignTarget);
    setReassignTarget("");
    onClose();
  };

  // "21 Jun 2026, 08:21 pm" — real timestamp formatting for the activity
  // timeline, replacing the previous raw ISO string.
  const formatLogTimestamp = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  };

  // Most recent log entry's timestamp — falls back to when the lead was
  // captured if it has no activity yet.
  const lastActivityTime = (l: Lead): string => {
    const sorted = [...(l.logs || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (sorted.length > 0) return formatLogTimestamp(sorted[0].timestamp);
    return l.createdAtStr ? formatLogTimestamp(l.createdAtStr) : "—";
  };

  const copyToClipboard = (field: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  };

  const shareLeadProfile = () => {
    // API Integration Point: Trigger Native Share API or Copy Link to Clipboard
    navigator.clipboard.writeText(`TaskEzy Lead Profile:\nName: ${lead.name}\nPhone: ${lead.phone}\nStatus: ${lead.status}`);
    alert("Lead link and summary copied to clipboard!");
  };

  // Status check to see if we render the Date & Time picker
  const needsReminderPicker =
    localStatus === "Follow up" ||
    localStatus === "Follow-ups" ||
    localStatus === "Visit Schedule" ||
    localStatus === "Site Visit" ||
    localStatus === "Meeting Scheduled" ||
    localStatus === "Site Visit Scheduled" ||
    localStatus === "Call Back";

  // Assigned/Property/Reassigned/Captured grid, plus ad-footprint fields
  // (Campaign/Meta Page/Lead Form ID) only when the lead actually carries
  // them — no empty rows for manually-entered or non-Meta leads.
  const metaFields: { label: string; value: React.ReactNode }[] = [
    {
      label: "Assigned To",
      value: (
        <span className="flex items-center gap-1">
          <User className="h-3 w-3 text-slate-400" /> {lead.assignedAgent || "Unassigned"}
        </span>
      )
    },
    { label: "Property", value: lead.property || "Not set" },
    {
      label: "Reassigned To",
      value: (
        <span className="flex items-center gap-1">
          {lead.previousAgent && <User className="h-3 w-3 text-slate-400" />} {lead.previousAgent || "—"}
        </span>
      )
    },
    { label: "Captured at", value: lead.createdAtStr ? formatLogTimestamp(lead.createdAtStr) : "—" },
    ...(lead.campaign ? [{ label: "Campaign", value: lead.campaign as React.ReactNode }] : []),
    ...(lead.metaPageName ? [{ label: "Meta Page", value: lead.metaPageName as React.ReactNode }] : []),
    ...(lead.metaFormId ? [{ label: "Lead Form ID", value: lead.metaFormId as React.ReactNode }] : [])
  ];

  // Rendered via a portal straight into <body> — the caller (the Leads page)
  // wraps its whole page in a div with the `animate-fade-in` utility, whose
  // keyframes end on `transform: translateY(0)` with `animation-fill-mode:
  // both`. That lingering non-"none" transform makes the page wrapper the
  // containing block for any `position: fixed` descendant, so this drawer's
  // "fixed to the viewport" positioning was actually scoped to that page
  // div's box instead of the real screen. A portal escapes that ancestor.
  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 transition-opacity" onClick={onClose} />

      {/* Drawer Panel (Right slide-out) */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white border-l border-slate-200 shadow-2xl z-[60] flex flex-col animate-slide-in">
        {/* Header — name, contact details (with copy), quick actions */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-extrabold text-slate-900 truncate">{lead.name}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 -mt-1 shrink-0">
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <a href={`tel:${lead.phone}`} className="hover:text-brand-700">{lead.phone}</a>
              <button onClick={() => copyToClipboard("phone", lead.phone)} className="text-slate-350 hover:text-brand-700" title="Copy phone">
                {copiedField === "phone" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            {lead.email && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <a href={`mailto:${lead.email}`} className="hover:text-brand-700 truncate">{lead.email}</a>
                <button onClick={() => copyToClipboard("email", lead.email)} className="text-slate-350 hover:text-brand-700 shrink-0" title="Copy email">
                  {copiedField === "email" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <a
              href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="h-7 w-7 bg-slate-50 hover:bg-emerald-50 border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:text-emerald-600 transition-colors"
              title="WhatsApp Message"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={shareLeadProfile}
              className="h-7 w-7 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
              title="Copy Summary"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Status + meta */}
        <div className="px-5 py-3 border-b border-slate-100 shrink-0 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">Current Status :</span>
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const panelWidth = 224;
                  const left = Math.max(8, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8));
                  setStatusMenuPos({ top: rect.bottom + 4, left });
                  setStatusSearch("");
                  setStatusMenuOpen(prev => !prev);
                }}
                className={`flex items-center gap-1.5 border rounded-lg px-2 py-0.5 text-[11px] font-bold transition-colors focus:outline-none ${statusBadgeClasses(localStatus)}`}
              >
                <span>{localStatus}</span>
                <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${statusMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {statusMenuOpen && statusMenuPos && createPortal(
                <>
                  <div className="fixed inset-0 z-[70]" onClick={() => setStatusMenuOpen(false)} />
                  <div
                    className="fixed z-[80] w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                    style={{ top: statusMenuPos.top, left: statusMenuPos.left }}
                  >
                    <div className="p-1.5 border-b border-slate-100">
                      <div className="relative">
                        <Search className="h-3 w-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                        <input
                          autoFocus
                          value={statusSearch}
                          onChange={(e) => setStatusSearch(e.target.value)}
                          placeholder="Search status..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-6 pr-2 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
                        />
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                      {filteredStatusOptions.length === 0 ? (
                        <p className="px-3 py-2 text-[11px] text-slate-400 italic">No matching status</p>
                      ) : (
                        filteredStatusOptions.map(st => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleSelectStatus(st)}
                            className={`w-full text-left px-3 py-1.5 text-xs font-semibold transition-colors ${
                              localStatus === st ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {st}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>,
                document.body
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
            <span>Last Updated : {lastActivityTime(lead)}</span>
            <span>Source : {lead.source || lead.campaign || "Direct / Manual Entry"}</span>
          </div>
        </div>

        {/* Assigned / Property / Reassigned / Captured (+ ad footprint, when present) */}
        <div className="px-5 py-3 border-b border-slate-100 shrink-0 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
          {metaFields.map(f => (
            <div key={f.label}>
              <span className="text-slate-400 font-bold text-[10px] block mb-0.5">{f.label} :</span>
              <span className="text-slate-800 font-semibold truncate block">{f.value}</span>
            </div>
          ))}
        </div>

        {/* Reminder scheduler — only for statuses that need a follow-up task */}
        {needsReminderPicker && (
          <div className="px-5 py-3 border-b border-slate-100 shrink-0">
            <form onSubmit={handleSaveReminder} className="bg-brand-50/40 border border-brand-100 rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center gap-1.5 text-[9px] font-extrabold text-brand-700">
                <Bell className="h-3.5 w-3.5 text-brand-600 animate-bounce" />
                <span>Configure Calendar Callback Task</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Callback Date</label>
                  <input
                    type="date"
                    required
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-700 focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Callback Time</label>
                  <input
                    type="time"
                    required
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-700 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-extrabold px-3 py-2 rounded-xl text-[10px] transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Save Task Reminder</span>
              </button>
            </form>
          </div>
        )}

        {/* Reassign — scoped to who this caller is actually allowed to hand the lead to */}
        <div className="px-5 py-3 border-b border-slate-100 shrink-0 space-y-2">
          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <Repeat className="h-3.5 w-3.5 text-slate-400" />
            Reassign Lead
          </span>
          {reassignTargets.length === 0 ? (
            <p className="text-[10px] text-slate-400 italic">No eligible teammates to reassign to.</p>
          ) : (
            <div className="flex gap-2">
              <select
                value={reassignTarget}
                onChange={(e) => setReassignTarget(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none"
              >
                <option value="">Select a team member…</option>
                {reassignTargets.map(u => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleReassign}
                disabled={!reassignTarget}
                className="shrink-0 bg-brand-700 hover:bg-brand-600 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all"
              >
                Reassign
              </button>
            </div>
          )}
        </div>

        {/* Activity History — a real vertical timeline (connecting line +
            node per entry, newest first) inside its own bordered,
            independently-scrollable card. Transition labels (e.g.
            "Call Back → Follow Up") are parsed from the lead's real log
            messages via deriveActivityTimeline — never invented; see that
            function's comment for exactly which formats it reads and how
            it falls back when a message doesn't match one. */}
        <div className="px-5 py-3 flex-1 min-h-0 flex flex-col">
          <span className="text-[11px] font-bold text-slate-500 block mb-2 shrink-0">Activity History :</span>
          <div className="bg-[#F5F9FF] border border-slate-200 rounded-2xl shadow-sm flex-1 min-h-0 overflow-y-auto p-4">
            {lead.logs.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">No activity recorded yet.</p>
            ) : (
              <div className="relative pl-5">
                <div className="absolute left-[5px] top-2 bottom-2 w-0.5 bg-blue-400" />
                {deriveActivityTimeline(lead.logs).map((entry, idx) => (
                  <div key={idx} className="relative pb-4 last:pb-0">
                    <span className="absolute -left-5 top-1.5 h-3 w-3 rounded-full bg-blue-100 border-2 border-blue-500 z-10" />
                    <div className="inline-block bg-[#0B1E6E] text-white text-[10px] font-bold px-2.5 py-1 rounded-lg mb-1.5">
                      {formatLogTimestamp(entry.log.timestamp)}
                    </div>
                    <div className="bg-[#EAF3FF] rounded-xl px-3 py-2.5">
                      <p className="text-[11px] text-slate-700 leading-snug">{entry.log.message}</p>
                      {entry.toLabel || entry.fromLabel ? (
                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-blue-100 text-[9px]">
                          <span className="text-slate-500 font-bold flex items-center gap-1">
                            {entry.fromLabel && entry.toLabel && entry.fromLabel !== entry.toLabel ? (
                              <>{entry.fromLabel} <ArrowRight className="h-2.5 w-2.5 shrink-0" /> {entry.toLabel}</>
                            ) : (
                              entry.toLabel || entry.fromLabel
                            )}
                          </span>
                          <span className="text-slate-400 font-semibold shrink-0">{entry.log.user}</span>
                        </div>
                      ) : (
                        <p className="text-[9px] text-slate-400 font-semibold mt-1.5 pt-1.5 border-t border-blue-100 text-right">by {entry.log.user}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
