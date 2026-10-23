"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import { WhatsAppIcon, CallIcon } from "@/components/icons/ContactIcons";
import RowActionsMenu from "@/components/ui/RowActionsMenu";

// A lead row's Action cell: "⋯" opening WhatsApp / Call (and Delete when the
// caller passes onDelete) — the same handlers the old row buttons used.
export default function LeadRowActionsMenu({
  onWhatsApp,
  onCall,
  callAllowed,
  onDelete
}: {
  onWhatsApp: () => void;
  onCall: () => void;
  callAllowed: boolean;
  onDelete?: () => void;
}) {
  return (
    <RowActionsMenu
      label="Lead actions"
      actions={[
        { label: "WhatsApp", icon: <WhatsAppIcon className="h-4 w-4" />, onClick: onWhatsApp },
        {
          label: "Call",
          icon: <CallIcon className="h-4 w-4 text-slate-600" />,
          onClick: onCall,
          disabled: !callAllowed,
          title: callAllowed ? undefined : "Calling is only available on the mobile app for your role"
        },
        ...(onDelete ? [{ label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: onDelete, danger: true }] : [])
      ]}
    />
  );
}
