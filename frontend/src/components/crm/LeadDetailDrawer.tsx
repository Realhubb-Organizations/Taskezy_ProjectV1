import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Phone, Mail, ArrowRight, Copy, Check, User, Pencil, ChevronDown } from "lucide-react";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";
import { useDialog } from "@/components/ui/DialogProvider";
import { SearchableSelect } from "@/components/ui/SearchableDropdown";
import { apiSetLeadProperty } from "@/lib/apiClient";
import { deriveActivityTimeline, nextStatusOptions, statusBadgeClasses, withDeadLeadGate } from "@/lib/leadStatusMapping";
import { canChangeLeadStatus, canReassignThisLead, isLeadAssignableUser, STATUS_LOCKED_HINT } from "@/lib/leadAssignment";
import { maskPhone, maskEmail } from "@/lib/maskPII";
import { canTriggerLeadCall, triggerLeadCall, triggerLeadWhatsApp } from "@/lib/callTrigger";
import { WhatsAppIcon, PlatformLabel } from "@/components/icons/ContactIcons";
import { callSubStatusOf } from "@/lib/callSubStatus";
import { useLeadStatusScheduler } from "@/lib/leadScheduler";
import LeadScheduleModal from "./LeadScheduleModal";

interface LeadDetailDrawerProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (leadId: string, status: LeadStatus, dealValue?: number, kycDocName?: string) => void;
  /** Called after a reassignment has been saved, so the caller can refresh its list. */
  onReassigned?: (leadId: string) => void;
  /** Called after the lead's note is saved, so the caller can update its list. */
  onNoteSaved?: (leadId: string, note: string, updated: Lead | null) => void;
  /** Called after the lead's property is saved, so the caller can update its list. */
  onPropertySaved?: (leadId: string, updated: Lead | null) => void;
}

export default function LeadDetailDrawer({
  lead,
  isOpen,
  onClose,
  onUpdateStatus,
  onReassigned,
  onNoteSaved,
  onPropertySaved
}: LeadDetailDrawerProps) {
  const { users, currentUser, activeRole, reassignLead, updateLeadNote, recordCallEnded, recordWhatsAppOpened } = useApp();
  const { toast, confirm, prompt: promptDialog } = useDialog();
  const callAllowed = canTriggerLeadCall(activeRole === "ADMIN", currentUser?.email);
  const [localStatus, setLocalStatus] = useState<LeadStatus>("New Lead");
  // Same Admin/Manager gate as the Leads table's own inline Property
  // editor (LeadDashboard.tsx's canAssignProperty) — kept in sync here so
  // this drawer and the table never disagree on who can edit it.
  const canEditProperty = activeRole === "ADMIN" || currentUser?.role_type === "Manager";
  const [savingProperty, setSavingProperty] = useState(false);
  // RNR/Call Back/Followup/Site Visit Scheduled are gated behind a blocking
  // popup (LeadScheduleModal below) that collects the next-call date/time +
  // a note before the status actually changes — every other status still
  // commits immediately. setLocalStatus runs as part of `commit` so it only
  // reflects reality once the change is real (not optimistically before a
  // popup the agent might still cancel). Called unconditionally (before the
  // `if (!isOpen || !lead) return null` guard below) since it's a hook.
  const scheduler = useLeadStatusScheduler((id, status) => {
    onUpdateStatus(id, status);
    setLocalStatus(status);
  });
  const [reassigning, setReassigning] = useState(false);
  // The lead's current note: what's saved, and the text being edited.
  const [savedNote, setSavedNote] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  // "Notes ▾" next to the status — the note editor opens under the status row.
  const [notesOpen, setNotesOpen] = useState(false);
  // "Campaign ▾" — opens the lead's ad details (Meta Page, Form ID, Campaign).
  const [campaignOpen, setCampaignOpen] = useState(false);
  useEffect(() => { setNotesOpen(false); setCampaignOpen(false); }, [lead?.id]);
  // Any click outside the Campaign button/panel closes it.
  const campaignRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!campaignOpen) return;
    const onDown = (e: PointerEvent) => {
      if (campaignRef.current && !campaignRef.current.contains(e.target as Node)) setCampaignOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [campaignOpen]);

  // Who this lead can be handed to: an ADMIN — any active sales user; a
  // Manager — herself or her direct reports; agents can't reassign at all.
  // Mirrors leads.service.ts (which is what actually enforces it — this list
  // just keeps the picker from offering choices that would come back 403).
  const reassignTargets = useMemo(() => {
    if (!currentUser) return [];
    const others = users.filter(u => u.name !== lead?.assignedAgent && isLeadAssignableUser(u));
    if (activeRole === "ADMIN") return others;
    if (currentUser.role_type === "Manager") {
      // Herself plus her direct reports (same as the server), minus the
      // lead's current owner — so a one-person team still offers the manager.
      return others.filter(u => u.id === currentUser.id || u.managerId === currentUser.id);
    }
    // Agents can't reassign leads (admins and managers only).
    return [];
  }, [users, currentUser, activeRole, lead?.assignedAgent]);

  useEffect(() => {
    if (lead) {
      setLocalStatus(lead.status);
      setCopiedField(null);
      setSavedNote(lead.notes ?? "");
      setNoteDraft(lead.notes ?? "");
    }
  }, [lead]);

  if (!isOpen || !lead) return null;

  const handleCall = () => {
    triggerLeadCall(lead, {
      isAdmin: activeRole === "ADMIN",
      userEmail: currentUser?.email,
      toast,
      onCallEnded: (leadId, startedAt, durationSeconds) => {
        recordCallEnded(leadId, startedAt, durationSeconds).catch((err) =>
          console.warn("Could not record call feedback gate:", err)
        );
      }
    });
  };

  const handleWhatsApp = () => {
    triggerLeadWhatsApp(lead, {
      isAdmin: activeRole === "ADMIN",
      senderName: currentUser?.name,
      onReturn: (leadId) => {
        recordWhatsAppOpened(leadId).catch((err) => console.warn("Could not record WhatsApp feedback gate:", err));
      }
    });
  };

  // Only statuses the transition matrix allows from the lead's current one
  // are offered — "Optional" ones need a one-tap confirm first (see
  // leadStatusMapping.ts). The backend re-enforces this independently
  // (leadStatusTransitions.ts), so a stale option here can't actually
  // commit anything it shouldn't — this is purely about not showing a
  // choice that would just come back as a 400.
  const statusChoices = nextStatusOptions(localStatus);
  const statusOptionsList = withDeadLeadGate([localStatus, ...statusChoices.map(c => c.status)], lead, activeRole === "ADMIN");

  const handleSelectStatus = async (nextStatus: LeadStatus) => {
    const choice = statusChoices.find(c => c.status === nextStatus);
    if (choice?.needsConfirm) {
      const ok = await confirm({
        title: `Move to "${nextStatus}"?`,
        message: `This isn't a typical next step from "${localStatus}" — confirm you want to do this anyway.`,
        confirmLabel: "Yes, move it"
      });
      if (!ok) return;
    }
    scheduler.requestChange(lead, nextStatus);
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
      setNotesOpen(false);
      toast("Note saved.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the note. Please try again.", "error");
    } finally {
      setSavingNote(false);
    }
  };

  // "Reassigned To" dropdown: picking a teammate asks for the required
  // handover note, then reassigns (the server enforces who may go to whom).
  const handleReassign = async (target: string) => {
    if (!target || reassigning) return;
    const note = await promptDialog({
      title: `Reassign to ${target}`,
      message: lead.name,
      label: "Note for the new agent",
      placeholder: "e.g. Prefers WhatsApp, site visit pending",
      confirmLabel: "Reassign",
      multiline: true,
      validate: (v) => (!v ? "Please write a note." : v.length > 2000 ? "Notes are limited to 2,000 characters." : null)
    });
    if (!note) return;
    setReassigning(true);
    try {
      await reassignLead(lead.id, target, note);
      toast(`Lead reassigned to ${target}.`, "success");
      onReassigned?.(lead.id);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not reassign this lead. Please try again.", "error");
    } finally {
      setReassigning(false);
    }
  };

  // Same endpoint and NO_PROPERTY-sentinel convention as the Leads table's
  // own inline Property dropdown (LeadDashboard.tsx's handlePropertyChange)
  // — this just gives the drawer the same control, editable from both
  // places now, not just the table.
  const NO_PROPERTY = "Not set";
  const handlePropertyChange = async (name: string) => {
    if (savingProperty || name === (lead.property || NO_PROPERTY)) return;
    const propertyId = name === NO_PROPERTY ? null : properties.find(p => p.name === name)?.id ?? null;
    setSavingProperty(true);
    try {
      const updated = mapApiLeadToFrontendLead(await apiSetLeadProperty(lead.id, propertyId));
      onPropertySaved?.(lead.id, updated);
      toast(propertyId ? `Property set to ${name}.` : "Property removed.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change the property. Please try again.", "error");
    } finally {
      setSavingProperty(false);
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

  // Assigned To = who first had the lead; Reassigned To = who has it now
  // (only once it has moved). Admins/managers change it from that dropdown.
  const canReassign = canReassignThisLead(lead, currentUser, users) && reassignTargets.length > 0;
  const reassignedToLabel = lead.previousAgent ? (lead.assignedAgent || "Unassigned") : "—";

  // Assigned/Property/Reassigned/Captured grid, plus ad-footprint fields
  // (Campaign/Meta Page/Lead Form ID) only when the lead actually carries
  // them — no empty rows for manually-entered or non-Meta leads.
  const metaFields: { label: string; labelExtra?: React.ReactNode; value: React.ReactNode }[] = [
    {
      label: "Assigned To",
      value: (
        <span className="flex items-center gap-1">
          <User className="h-3 w-3 text-slate-400" /> {lead.previousAgent || lead.assignedAgent || "Unassigned"}
        </span>
      )
    },
    {
      label: "Property",
      labelExtra: (
        <span
          className={`shrink-0 border rounded-lg px-1.5 py-0.5 text-[10px] font-semibold ${lead.property ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}
          title={lead.property ? "This lead has a property linked" : "No property linked yet"}
        >
          {lead.property ? "Assigned" : "Unassigned"}
        </span>
      ),
      value: <span title={lead.property || undefined}>{lead.property || "Not set"}</span>
    },
    {
      label: "Reassigned To",
      value: canReassign ? (
        <SearchableSelect
          variant="inline"
          value=""
          onChange={handleReassign}
          options={reassignTargets.map(u => u.name)}
          placeholder={reassigning ? "Saving..." : reassignedToLabel === "—" ? "Select" : reassignedToLabel}
          searchPlaceholder="Search team members..."
          panelWidth={220}
          disabled={reassigning}
          className="max-w-full text-xs font-semibold text-slate-800"
        />
      ) : (
        <span className="flex items-center gap-1">
          {reassignedToLabel !== "—" && <User className="h-3 w-3 text-slate-400" />} {reassignedToLabel}
        </span>
      )
    },
    { label: "Captured at", value: lead.createdAtStr ? formatLogTimestamp(lead.createdAtStr) : "—" }
  ];
  // Ad-source attribution (ad-platform/marketing concern) — Admin-only, and
  // only the fields the lead actually carries. Shown under "Campaign ▾".
  const adFields: { label: string; value: string }[] = activeRole === "ADMIN"
    ? [
        ...(lead.metaPageName ? [{ label: "Meta Page", value: lead.metaPageName }] : []),
        ...(lead.metaFormId ? [{ label: "Lead Form ID", value: lead.metaFormId }] : []),
        ...(lead.campaign ? [{ label: "Campaign", value: lead.campaign }] : [])
      ]
    : [];

  // Rendered via a portal straight into <body> — the caller (the Leads page)
  // wraps its whole page in a div with the `animate-fade-in` utility, whose
  // keyframes end on `transform: translateY(0)` with `animation-fill-mode:
  // both`. That lingering non-"none" transform makes the page wrapper the
  // containing block for any `position: fixed` descendant, so this drawer's
  // "fixed to the viewport" positioning was actually scoped to that page
  // div's box instead of the real screen. A portal escapes that ancestor.
  return (
    <>
      {createPortal(
    <div className="fixed inset-0 z-50" data-lead-drawer>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 transition-opacity" onClick={onClose} />

      {/* Drawer Panel (Right slide-out) */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white border-l border-slate-200 shadow-2xl z-[60] flex flex-col animate-slide-in">
        {/* Header — name, contact row (WhatsApp, call, copy), email */}
        <div className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg font-extrabold text-slate-900 truncate">{lead.name}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 -mt-1 shrink-0" aria-label="Close">
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
          {/* Phone/email text is masked for Manager/sales agent — Admin
              always sees the real value. Calling still dials the real number
              (masking is display-only), and the copy buttons are Admin-only
              since copying would leak the real value despite the masked text. */}
          <div className="mt-3 flex items-center gap-4">
            {/* contact icons, then Campaign ▾ pushed to the right */}
            <button type="button" onClick={handleWhatsApp} className="shrink-0 hover:opacity-80" title="WhatsApp message" aria-label="WhatsApp message">
              <WhatsAppIcon className="h-6 w-6" />
            </button>
            {/* Phone — the number shows on hover (stays open while the pointer
                is on it, so it can be copied); clicking the icon calls. */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => callAllowed && handleCall()}
                disabled={!callAllowed}
                aria-label="Call"
                title={callAllowed ? undefined : "Calling is only available on the mobile app for your role"}
                className="flex text-slate-600 hover:text-[#0B1E6E] disabled:opacity-40 disabled:hover:text-slate-600"
              >
                <Phone className="h-5 w-5" />
              </button>
              <div className="absolute left-0 top-full z-20 pt-2 hidden group-hover:block group-focus-within:block">
                <div className="inline-flex items-center gap-2 whitespace-nowrap bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-sm text-slate-800">
                  {activeRole === "ADMIN" ? lead.phone : maskPhone(lead.phone)}
                  {activeRole === "ADMIN" && (
                    <button onClick={() => copyToClipboard("phone", lead.phone)} className="text-slate-400 hover:text-brand-700" title="Copy phone">
                      {copiedField === "phone" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {!lead.email ? (
              <span className="flex text-slate-300 cursor-default" title="No email" aria-label="No email">
                <Mail className="h-6 w-6" />
              </span>
            ) : (
              <div className="relative group">
                <a href={`mailto:${lead.email}`} aria-label="Email" className="flex text-slate-600 hover:text-[#0B1E6E]">
                  <Mail className="h-6 w-6" />
                </a>
                <div className="absolute left-0 top-full z-20 pt-2 hidden group-hover:block group-focus-within:block">
                  <div className="inline-flex items-center gap-2 whitespace-nowrap bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-sm text-slate-800">
                    {activeRole === "ADMIN" ? lead.email : maskEmail(lead.email)}
                    {activeRole === "ADMIN" && (
                      <button onClick={() => copyToClipboard("email", lead.email)} className="text-slate-400 hover:text-brand-700" title="Copy email">
                        {copiedField === "email" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {adFields.length > 0 && (
              <div ref={campaignRef} className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setCampaignOpen(o => !o)}
                  aria-expanded={campaignOpen}
                  title={lead.campaign || undefined}
                  className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-[#0B1E6E]"
                >
                  Campaign
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${campaignOpen ? "rotate-180" : ""}`} />
                </button>
                {campaignOpen && (
                  <>
                    <div className="absolute right-0 top-full mt-2 z-30 w-64 bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 space-y-2">
                      {adFields.map(f => (
                        <div key={f.label}>
                          <span className="text-slate-500 font-bold text-[11px] block">{f.label} :</span>
                          <span className="text-xs text-slate-800 font-medium [overflow-wrap:anywhere]">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Body — scrolls as one; Activity History takes the rest of the height. */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* Current Status (+ Notes ▾) */}
        <div className="px-6 py-3 border-b border-slate-200 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-800">Current Status :</span>
              {callSubStatusOf(lead) && (
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${
                    callSubStatusOf(lead) === "Qualified"
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                      : "text-red-600 bg-red-50 border-red-200"
                  }`}
                  title="Sub-status, set from Data Calling when the call is Connected"
                >
                  {callSubStatusOf(lead)}
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
                  className={`border rounded-lg px-2 py-0.5 text-[11px] transition-colors focus:outline-none ${statusBadgeClasses(localStatus)}`}
                />
              ) : (
                <span className={`border rounded-lg px-2 py-0.5 text-[11px] ${statusBadgeClasses(localStatus)}`} title={STATUS_LOCKED_HINT}>
                  {localStatus}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(o => !o)}
              aria-expanded={notesOpen}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-[#0B1E6E]"
            >
              <Pencil className="h-3.5 w-3.5" />
              Notes
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${notesOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
            <span>Last Updated : {lastActivityTime(lead)}</span>
            {/* Ad-source attribution — Admin-only. */}
            {activeRole === "ADMIN" && (
              <span className="flex items-center gap-1.5">Source : <PlatformLabel text={lead.source || lead.campaign || "Direct / Manual Entry"} iconOnly /></span>
            )}
          </div>

          {/* Notes — the lead's current note (people only, not system events) */}
          {notesOpen && (
            <div className="pt-1 space-y-2">
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
          )}
        </div>

        {/* Assigned To / Property / Reassigned To / Captured at (+ ad
            footprint for Admin — see metaFields above) */}
        <div className="px-6 py-4 border-b border-slate-200 grid grid-cols-2 gap-x-4 gap-y-4 text-xs">
          {metaFields.map(f => (
            <div key={f.label} className="min-w-0">
              <span className="text-slate-800 font-extrabold text-xs flex items-center gap-1.5 mb-1">{f.label} :{f.labelExtra}</span>
              <span className="text-slate-700 font-medium block truncate">{f.value}</span>
            </div>
          ))}
        </div>

        {/* Activity History — a real vertical timeline (connecting line +
            node per entry, newest first) in a large bordered card that fills
            the rest of the drawer. Transition labels (e.g. "Call Back →
            Follow Up") are parsed from the lead's real log messages via
            deriveActivityTimeline — never invented. */}
        <div className="px-6 py-4 flex-1 min-h-[28rem] flex flex-col">
          <span className="text-xs font-extrabold text-slate-800 block mb-3 shrink-0">Activity History :</span>
          <div className="bg-[#F5F9FF] border border-slate-300 rounded-2xl shadow-sm flex-1 min-h-0 overflow-y-auto p-4">
            {lead.logs.length === 0 ? (
              <p className="text-[12px] text-slate-400 italic">No activity recorded yet.</p>
            ) : (
              <div className="relative pl-5">
                <div className="absolute left-[5px] top-2 bottom-2 w-0.5 bg-blue-400" />
                {deriveActivityTimeline(lead.logs).map((entry, idx) => (
                  <div key={idx} className="relative pb-4 last:pb-0">
                    <span className="absolute -left-5 top-1.5 h-3 w-3 rounded-full bg-blue-100 border-2 border-blue-500 z-10" />
                    <div className="inline-block bg-[#0B1E6E] text-white text-[11px] font-bold px-2.5 py-1 rounded-lg mb-1.5">
                      {formatLogTimestamp(entry.log.timestamp)}
                    </div>
                    <div className="bg-[#EAF3FF] rounded-xl px-3.5 py-3">
                      <p className="text-[13px] text-slate-700 leading-relaxed [overflow-wrap:anywhere]">{entry.log.message}</p>
                      {entry.toLabel || entry.fromLabel ? (
                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-blue-100 text-[11px]">
                          <span className="text-slate-500 font-bold flex items-center gap-1">
                            {entry.fromLabel && entry.toLabel && entry.fromLabel !== entry.toLabel ? (
                              <>{entry.fromLabel} <ArrowRight className="h-2.5 w-2.5 shrink-0" /> {entry.toLabel}</>
                            ) : (
                              entry.toLabel || entry.fromLabel
                            )}
                          </span>
                          <span className="text-slate-500 font-bold shrink-0">{entry.log.user}</span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 font-bold mt-2 pt-2 border-t border-blue-100 text-right">by {entry.log.user}</p>
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
      )}
      {scheduler.pendingSchedule && (
        <LeadScheduleModal
          pending={scheduler.pendingSchedule}
          submitting={scheduler.submitting}
          error={scheduler.error}
          onCancel={scheduler.cancelSchedule}
          onConfirm={scheduler.confirmSchedule}
        />
      )}
    </>
  );
}
