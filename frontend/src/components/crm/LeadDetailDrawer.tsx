import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Phone, MessageSquare, Mail, Share2, Calendar, ArrowRight, Bell, Repeat, Copy, Check, User, Pencil } from "lucide-react";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";
import { useDialog } from "@/components/ui/DialogProvider";
import { SearchableSelect } from "@/components/ui/SearchableDropdown";
import { DatePicker } from "@/components/ui/DateRangePicker";
import { deriveActivityTimeline, STATUS_OPTIONS, statusBadgeClasses } from "@/lib/leadStatusMapping";
import { canChangeLeadStatus, STATUS_LOCKED_HINT } from "@/lib/leadAssignment";

interface LeadDetailDrawerProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (leadId: string, status: LeadStatus, dealValue?: number, kycDocName?: string, subStatus?: "Qualified" | "Not Qualified") => void;
  // Data Calling opens this same drawer for its own leads but with a
  // deliberately narrower status model (New Lead/RNR/Connected) — when set,
  // this replaces the full STATUS_OPTIONS list. Defaults to the full list
  // for every other caller (main Leads dashboard).
  statusOptions?: LeadStatus[];
  // Statuses in `statusOptions` that need something more than a bare status
  // change before they can commit (Data Calling's RNR needs a next-call
  // date, Connected needs a Qualified/Not Qualified sub-status) — picking
  // one of these calls onRestrictedStatus instead of onUpdateStatus,
  // handing off to whatever flow the caller already has for it rather than
  // duplicating that UI inside this shared drawer.
  restrictedStatuses?: LeadStatus[];
  onRestrictedStatus?: (leadId: string, leadName: string, status: LeadStatus) => void;
  /** Called after a reassignment has been saved, so the caller can refresh its list. */
  onReassigned?: (leadId: string) => void;
  /** Called after the lead's note is saved, so the caller can update its list. */
  onNoteSaved?: (leadId: string, note: string, updated: Lead | null) => void;
}

export default function LeadDetailDrawer({
  lead,
  isOpen,
  onClose,
  onUpdateStatus,
  statusOptions,
  restrictedStatuses,
  onRestrictedStatus,
  onReassigned,
  onNoteSaved
}: LeadDetailDrawerProps) {
  const { addNotification, addCalendarEvent, addFollowupCall, users, currentUser, activeRole, reassignLead, updateLeadNote } = useApp();
  const { toast } = useDialog();
  const [localStatus, setLocalStatus] = useState<LeadStatus>("New Lead");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminderSet, setReminderSet] = useState(false);
  const [reassignTarget, setReassignTarget] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState("");
  const [reassignNote, setReassignNote] = useState("");
  // The lead's current note: what's saved, and the text being edited.
  const [savedNote, setSavedNote] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
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
      setCopiedField(null);
      setReassignTarget("");
      setReassignError("");
      setReassignNote("");
      setSavedNote(lead.notes ?? "");
      setNoteDraft(lead.notes ?? "");
    }
  }, [lead]);

  if (!isOpen || !lead) return null;

  const handleSelectStatus = (nextStatus: LeadStatus) => {
    if (restrictedStatuses?.includes(nextStatus) && onRestrictedStatus) {
      onRestrictedStatus(lead.id, lead.name, nextStatus);
      return;
    }
    setLocalStatus(nextStatus);
    onUpdateStatus(lead.id, nextStatus);
  };

  const baseStatusOptions = statusOptions ?? STATUS_OPTIONS;
  const statusOptionsList = baseStatusOptions.includes(localStatus) ? baseStatusOptions : [localStatus, ...baseStatusOptions];

  const handleSaveReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderDate || !reminderTime) {
      toast("Please select both Date and Time for the reminder.", "warning");
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
    toast(`Reminder saved for ${lead.name}.`, "success");
  };

  const handleSaveNote = async () => {
    const note = noteDraft.trim();
    if (!note || note === savedNote || savingNote) return;
    setSavingNote(true);
    try {
      const updated = await updateLeadNote(lead.id, note);
      setSavedNote(note);
      setNoteDraft(note);
      onNoteSaved?.(lead.id, note, updated);
      toast("Note saved.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the note. Please try again.", "error");
    } finally {
      setSavingNote(false);
    }
  };

  const handleReassign = async () => {
    if (!reassignTarget || !reassignNote.trim() || reassigning) return;
    setReassigning(true);
    setReassignError("");
    try {
      await reassignLead(lead.id, reassignTarget, reassignNote.trim());
      setReassignTarget("");
      setReassignNote("");
      onReassigned?.(lead.id);
      onClose();
    } catch (err) {
      setReassignError(err instanceof Error ? err.message : "Could not reassign this lead. Please try again.");
    } finally {
      setReassigning(false);
    }
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
    toast("Lead link and summary copied to clipboard!", "success");
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
      label: "Reassign From",
      value: lead.previousAgent ? (
        <span className="flex flex-col">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3 text-slate-400" /> {lead.assignedAgent || "Unassigned"}
          </span>
          <span className="text-[10px] text-slate-400 font-normal">from {lead.previousAgent}</span>
        </span>
      ) : "—"
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
              className="inline-flex h-10 w-10 sm:h-7 sm:w-7 bg-slate-50 hover:bg-emerald-50 border border-slate-200 rounded-lg items-center justify-center text-slate-500 hover:text-emerald-600 transition-colors"
              title="WhatsApp Message"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={shareLeadProfile}
              className="inline-flex h-10 w-10 sm:h-7 sm:w-7 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
              title="Copy Summary"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable body — everything below the header scrolls together so
            the reminder and reassign controls stay reachable on short phone
            viewports. The header above stays pinned. */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* Status + meta */}
        <div className="px-5 py-3 border-b border-slate-100 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">Current Status :</span>
            <div className="flex items-center gap-1.5">
              {lead.status === "Connected" && lead.subStatus && (
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${
                    lead.subStatus === "Qualified"
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                      : "text-red-600 bg-red-50 border-red-200"
                  }`}
                >
                  {lead.subStatus}
                </span>
              )}
              {canChangeLeadStatus(lead, currentUser, users) ? (
                <SearchableSelect
                  variant="inline"
                  value={localStatus}
                  onChange={(v) => handleSelectStatus(v as LeadStatus)}
                  options={statusOptionsList}
                  searchPlaceholder="Search status..."
                  panelWidth={224}
                  align="right"
                  className={`border rounded-lg px-2 py-0.5 text-[11px] transition-colors focus:outline-none ${statusBadgeClasses(localStatus)}`}
                />
              ) : (
                <span className={`border rounded-lg px-2 py-0.5 text-[11px] ${statusBadgeClasses(localStatus)}`} title={STATUS_LOCKED_HINT}>
                  {localStatus}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
            <span>Last Updated : {lastActivityTime(lead)}</span>
            <span>Source : {lead.source || lead.campaign || "Direct / Manual Entry"}</span>
          </div>
        </div>

        {/* Assigned / Property / Reassigned / Captured (+ ad footprint, when present) */}
        <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
          {metaFields.map(f => (
            <div key={f.label}>
              <span className="text-slate-400 font-bold text-[10px] block mb-0.5">{f.label} :</span>
              <span className="text-slate-800 font-semibold truncate block">{f.value}</span>
            </div>
          ))}
        </div>

        {/* Reminder scheduler — only for statuses that need a follow-up task */}
        {needsReminderPicker && (
          <div className="px-5 py-3 border-b border-slate-100">
            <form onSubmit={handleSaveReminder} className="bg-brand-50/40 border border-brand-100 rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center gap-1.5 text-[9px] font-extrabold text-brand-700">
                <Bell className="h-3.5 w-3.5 text-brand-600 animate-bounce" />
                <span>Configure Calendar Callback Task</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Callback Date</label>
                  <DatePicker
                    value={reminderDate}
                    onChange={setReminderDate}
                    className="w-full flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-700 focus:outline-none focus:border-brand-500"
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
                className="w-full bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold px-5 py-2 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <Calendar className="h-4 w-4" />
                <span>Save Task Reminder</span>
              </button>
            </form>
          </div>
        )}

        {/* Reassign — scoped to who this caller is actually allowed to hand the lead to */}
        <div className="px-5 py-3 border-b border-slate-100 space-y-2">
          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <Repeat className="h-3.5 w-3.5 text-slate-400" />
            Reassign Lead
          </span>
          {reassignTargets.length === 0 ? (
            <p className="text-[10px] text-slate-400 italic">No eligible teammates to reassign to.</p>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  value={reassignTarget}
                  onChange={setReassignTarget}
                  options={reassignTargets.map(u => ({ value: u.name, label: u.name }))}
                  placeholder="Select a team member…"
                  searchPlaceholder="Search team members..."
                />
              </div>
              <button
                type="button"
                onClick={handleReassign}
                disabled={!reassignTarget || !reassignNote.trim() || reassigning}
                className="shrink-0 bg-[#0B1E6E] hover:bg-[#081650] disabled:opacity-40 text-white font-bold px-5 py-2 rounded-xl text-sm transition-all"
              >
                {reassigning ? "Saving..." : "Reassign"}
              </button>
            </div>
          )}
          {reassignTargets.length > 0 && (
            <textarea
              aria-label="Reassign note"
              value={reassignNote}
              onChange={(e) => setReassignNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Note for the new agent (required) — e.g. Prefers WhatsApp, site visit pending"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 resize-y focus:outline-none focus:border-brand-500"
            />
          )}
          {reassignError && (
            <p className="text-[11px] text-red-600 font-semibold">{reassignError}</p>
          )}
        </div>

        {/* Notes — the lead's current note (people only, not system events) */}
        <div className="px-5 py-3 border-b border-slate-100 space-y-2">
          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <Pencil className="h-3.5 w-3.5 text-slate-400" />
            Notes
          </span>
          {canChangeLeadStatus(lead, currentUser, users) ? (
            <>
              <textarea
                aria-label="Lead note"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Write a note about this lead — e.g. Wants a 3BHK under 1.5 Cr, call after 6 pm"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 resize-y focus:outline-none focus:border-brand-500"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-400">
                  {lead.notesUpdatedBy && savedNote === (lead.notes ?? "") ? `Last edited by ${lead.notesUpdatedBy}` : ""}
                </span>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={!noteDraft.trim() || noteDraft.trim() === savedNote || savingNote}
                  className="shrink-0 bg-[#0B1E6E] hover:bg-[#081650] disabled:opacity-40 text-white font-bold px-4 py-1.5 rounded-xl text-xs transition-all"
                >
                  {savingNote ? "Saving..." : savedNote ? "Update note" : "Save note"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-700 whitespace-pre-line [overflow-wrap:anywhere]">{savedNote || "No note yet."}</p>
          )}
        </div>

        {/* Activity History — a real vertical timeline (connecting line +
            node per entry, newest first) inside its own bordered,
            independently-scrollable card. Transition labels (e.g.
            "Call Back → Follow Up") are parsed from the lead's real log
            messages via deriveActivityTimeline — never invented; see that
            function's comment for exactly which formats it reads and how
            it falls back when a message doesn't match one. */}
        <div className="px-5 py-3 flex-1 min-h-[14rem] flex flex-col">
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
      </div>
    </div>,
    document.body
  );
}
