"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { apiGetUserDeleteImpact } from "@/lib/apiClient";
import { SearchableMultiSelect } from "@/components/ui/SearchableDropdown";
import { LineSkeleton } from "@/components/ui/Skeletons";

// Admin "Delete user" popup (Settings → Manage Users and the Admin page).
// A user who still holds leads can only be deleted after choosing who gets
// them: one or more active sales agents/managers (split round-robin, like
// Bulk Assign) plus a required note, which the server writes on every lead.
// z-[150]: above the user editor (z-40), below the dropdown panel (z-[200]) so the member picker opens on top.
export default function DeleteUserModal({
  user,
  onClose,
  onDeleted
}: {
  user: { id: string; name: string };
  onClose: () => void;
  /** Called after the server deleted the user, with a message to show. */
  onDeleted: (message: string) => void;
}) {
  const { users, deleteTeamMember } = useApp();
  const [leadCount, setLeadCount] = useState<number | null>(null);
  const [reportNames, setReportNames] = useState<string[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setLeadCount(null);
    apiGetUserDeleteImpact(user.id)
      .then(r => { if (!cancelled) { setLeadCount(r.leadCount); setReportNames(r.reportNames ?? []); } })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [user.id, loadNonce]);

  // Same people the server accepts: active CRM sales agents and managers.
  const members = useMemo(
    () => users
      .filter(u => u.id !== user.id && u.role === "AGENT" && u.status !== "INACTIVE" && (!u.department || u.department === "SALES"))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [users, user.id]
  );
  const memberOptions = members.map(m => ({
    value: m.id,
    label: m.role_type?.toUpperCase() === "MANAGER" ? `${m.name} (Manager)` : m.name
  }));

  // Round-robin preview: the first (leadCount % n) members get one extra.
  const split = useMemo(() => {
    if (!leadCount || memberIds.length === 0) return [];
    const base = Math.floor(leadCount / memberIds.length);
    const extra = leadCount % memberIds.length;
    return memberIds.map((id, i) => ({
      id,
      name: members.find(m => m.id === id)?.name ?? "Member",
      count: base + (i < extra ? 1 : 0)
    }));
  }, [leadCount, memberIds, members]);

  // If the lead check failed we don't know, so ask who gets the leads anyway
  // (never a dead end); the server hands over whatever they actually hold.
  const leadsUnknown = loadError;
  const needsHandover = leadsUnknown || (leadCount ?? 0) > 0;
  const trimmedNote = note.trim();
  const canSubmit = (leadCount !== null || leadsUnknown) && !submitting && (!needsHandover || (memberIds.length > 0 && trimmedNote.length > 0));

  const close = () => { if (!submitting) onClose(); };

  const submit = async () => {
    if (!canSubmit) return;
    if (needsHandover && trimmedNote.length > 2000) {
      setError("Notes are limited to 2,000 characters.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { reassignedLeads } = await deleteTeamMember(user.id, needsHandover ? { reassignTo: memberIds, note: trimmedNote } : undefined);
      const names = memberIds.map(id => members.find(m => m.id === id)?.name ?? "Member").join(", ");
      onDeleted(
        reassignedLeads > 0
          ? `Removed ${user.name}. ${reassignedLeads} lead${reassignedLeads === 1 ? "" : "s"} reassigned to ${names}.`
          : `Removed ${user.name} from the roster.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the user. Please try again.");
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <div className="fixed inset-0 bg-slate-900/40" onClick={close} />
      <form
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-lg font-extrabold text-slate-900">Delete user?</h3>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {leadCount === null && !leadsUnknown ? (
            <div className="space-y-2">
              <LineSkeleton width={260} height={14} />
              <LineSkeleton width={180} height={14} />
            </div>
          ) : !needsHandover ? (
            <p className="text-sm text-slate-700">
              Are you sure you want to delete <span className="font-bold">{user.name}</span>? This can&apos;t be undone.
            </p>
          ) : (
            <>
              {leadsUnknown ? (
                <p className="text-sm text-slate-700">
                  Choose who should get <span className="font-bold">{user.name}</span>&apos;s leads (if they have any).
                  They&apos;ll be split evenly, and {user.name} is deleted only after the leads are reassigned.{" "}
                  <button type="button" onClick={() => setLoadNonce(n => n + 1)} className="font-bold text-[#0B1E6E] hover:underline">
                    Check lead count again
                  </button>
                </p>
              ) : (
                <p className="text-sm text-slate-700">
                  <span className="font-bold">{user.name}</span> has{" "}
                  <span className="font-bold">{leadCount} lead{leadCount === 1 ? "" : "s"}</span>. Choose who should get them.
                  They&apos;ll be split evenly, and {user.name} is deleted only after the leads are reassigned.
                </p>
              )}

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500">Reassign leads to</label>
                <SearchableMultiSelect
                  variant="field"
                  selected={memberIds}
                  onChange={(ids) => { setMemberIds(ids); setError(""); }}
                  options={memberOptions}
                  placeholder="Select member(s)"
                  searchPlaceholder="Search members..."
                  panelWidth={280}
                />
                {members.length === 0 && (
                  <p className="text-[11px] text-red-600 font-semibold">No active sales agents or managers to reassign to.</p>
                )}
                {split.length > 0 && (
                  <ul className="mt-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 space-y-1">
                    {split.map(s => (
                      <li key={s.id} className="flex items-center justify-between gap-3 text-xs text-slate-700">
                        <span className="truncate">{s.name}</span>
                        <span className="font-bold shrink-0">{s.count} lead{s.count === 1 ? "" : "s"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500">Note</label>
                <textarea
                  value={note}
                  rows={3}
                  onChange={(e) => { setNote(e.target.value); setError(""); }}
                  placeholder="e.g. Naveen has left; please call these leads back this week"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 resize-y focus:outline-none focus:border-brand-500"
                />
                <p className="text-[11px] text-slate-400">Saved on every reassigned lead.</p>
              </div>
            </>
          )}

          {leadCount !== null && reportNames.length > 0 && (
            <div className="p-2.5 bg-amber-50 border border-amber-100 text-[11px] text-amber-800 rounded-xl font-semibold flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span>
                {reportNames.join(", ")} report{reportNames.length === 1 ? "s" : ""} to {user.name}. After deleting, set a new
                &quot;Reports to&quot; for {reportNames.length === 1 ? "them" : "each of them"} from Manage Users (pencil icon).
              </span>
            </div>
          )}

          {error && (
            <div className="p-2.5 bg-red-50 border border-red-100 text-[11px] text-red-700 rounded-xl font-bold flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="px-5 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-2 rounded-xl font-bold text-sm text-white bg-red-600 hover:bg-red-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {submitting ? "Deleting..." : needsHandover ? "Reassign & delete" : "Delete"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
