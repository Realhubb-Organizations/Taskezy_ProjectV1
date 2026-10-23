"use client";

import React, { useState } from "react";
import { FileText, Pencil } from "lucide-react";
import { Lead, useApp } from "@/context/AppContext";
import { useDialog } from "@/components/ui/DialogProvider";
import { canChangeLeadStatus } from "@/lib/leadAssignment";

// Notes column cell: the lead's current note (written by a person, never a
// system event) with a pencil to write or edit it. Only the lead's owner,
// their manager or an admin get the pencil; everyone else sees the note.
export default function LeadNoteCell({
  lead,
  onSaved,
  compact = false
}: {
  lead: Lead;
  /** Phone layout: a document icon + the note text, the whole cell taps to edit. */
  compact?: boolean;
  /** Called with the saved note so a table holding its own copy of the rows can update. */
  onSaved?: (leadId: string, note: string, updated: Lead | null) => void;
}) {
  const { currentUser, users, updateLeadNote } = useApp();
  const { prompt, toast } = useDialog();
  const [saving, setSaving] = useState(false);
  const canEdit = canChangeLeadStatus(lead, currentUser, users);

  const edit = async () => {
    const note = await prompt({
      title: lead.notes ? "Edit note" : "Add note",
      message: lead.name,
      label: "Note",
      placeholder: "e.g. Wants a 3BHK under 1.5 Cr, call after 6 pm",
      defaultValue: lead.notes ?? "",
      confirmLabel: "Save note",
      multiline: true,
      validate: (v) => (!v ? "Please write a note." : v.length > 2000 ? "Notes are limited to 2,000 characters." : null)
    });
    if (note === null || note === lead.notes) return;
    setSaving(true);
    try {
      const updated = await updateLeadNote(lead.id, note);
      onSaved?.(lead.id, note, updated);
      toast("Note saved.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the note. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (compact) {
    const body = (
      <>
        <FileText className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" aria-hidden="true" />
        <span className={`line-clamp-2 [overflow-wrap:anywhere] min-w-0 text-left text-[11px] leading-snug ${lead.notes ? "text-slate-700" : "text-slate-400"}`}>
          {lead.notes || (canEdit ? "Add note" : "—")}
        </span>
      </>
    );
    return canEdit ? (
      <button
        type="button"
        onClick={edit}
        disabled={saving}
        title={lead.notes ? "Edit note" : "Add note"}
        className="flex items-start gap-1.5 min-w-0 w-full rounded-md hover:bg-slate-50 disabled:opacity-40"
      >
        {body}
      </button>
    ) : (
      <div className="flex items-start gap-1.5 min-w-0" title={lead.notes}>{body}</div>
    );
  }

  return (
    <div className="flex items-start gap-1.5 min-w-0">
      {lead.notes ? (
        <span className="line-clamp-3 [overflow-wrap:anywhere] min-w-0 flex-1" title={lead.notes}>{lead.notes}</span>
      ) : (
        <span className="text-slate-400 min-w-0 flex-1">{canEdit ? "Add note" : "—"}</span>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={edit}
          disabled={saving}
          className="shrink-0 inline-flex items-center justify-center h-8 w-8 sm:h-6 sm:w-6 -mt-0.5 rounded-md text-slate-400 hover:text-[#0B1E6E] hover:bg-slate-100 disabled:opacity-40 transition-colors"
          title={lead.notes ? "Edit note" : "Add note"}
          aria-label={lead.notes ? "Edit note" : "Add note"}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
