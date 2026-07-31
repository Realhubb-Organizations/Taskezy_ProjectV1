import React, { useState, useEffect } from "react";
import { X, Phone, MessageSquare, Mail, Share2, Award, Calendar, Clock, ArrowRight, Activity, Bell } from "lucide-react";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";

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
  const { addNotification, addCalendarEvent } = useApp();
  const [localStatus, setLocalStatus] = useState<LeadStatus>("New Lead");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminderSet, setReminderSet] = useState(false);

  useEffect(() => {
    if (lead) {
      setLocalStatus(lead.status);
      setReminderDate("");
      setReminderTime("");
      setReminderSet(false);
    }
  }, [lead]);

  if (!isOpen || !lead) return null;

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = e.target.value as LeadStatus;
    setLocalStatus(nextStatus);
    onUpdateStatus(lead.id, nextStatus);
  };

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
    alert(`Calendar Task Saved!\nLead: ${lead.name}\nStatus: ${localStatus}\nDate: ${reminderDate}\nTime: ${reminderTime}\nNotification scheduled.`);
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

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Drawer Panel (Right slide-out) */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white border-l border-slate-200 shadow-2xl z-55 flex flex-col animate-slide-in">
        {/* Header Title Controls */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Lead ID: {lead.id}</span>
            <h3 className="text-sm font-extrabold text-slate-805 truncate">{lead.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="flex justify-between items-center px-6 py-3.5 bg-slate-50 border-b border-slate-100 text-xs">
          <div className="flex gap-2">
            <a
              href={`tel:${lead.phone}`}
              className="h-8 w-8 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-505 hover:text-brand-650 transition-colors shadow-sm"
              title="Call Dialer"
            >
              <Phone className="h-4 w-4" />
            </a>
            <a
              href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="h-8 w-8 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-505 hover:text-emerald-600 transition-colors shadow-sm"
              title="WhatsApp Message"
            >
              <MessageSquare className="h-4 w-4" />
            </a>
            <a
              href={`mailto:${lead.email}`}
              className="h-8 w-8 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-550 hover:text-blue-600 transition-colors shadow-sm"
              title="Send Email"
            >
              <Mail className="h-4 w-4" />
            </a>
            <button
              onClick={shareLeadProfile}
              className="h-8 w-8 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-505 hover:text-slate-700 transition-colors shadow-sm"
              title="Copy Summary"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-brand-50 border border-brand-100 text-brand-700 px-3 py-1 rounded-xl font-bold shadow-sm">
            <Award className="h-4 w-4 text-brand-600" />
            <span>AI Match: {lead.leadScore || 85}%</span>
          </div>
        </div>

        {/* Scrollable Details */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {/* Section A: Contact Details & Property Interested */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">Section A: Contact Profile</h4>
            <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
              <div>
                <span className="text-[8px] font-bold text-slate-400 uppercase block">Phone</span>
                <span className="text-slate-800">{lead.phone}</span>
              </div>
              <div>
                <span className="text-[8px] font-bold text-slate-400 uppercase block">Email</span>
                <span className="text-slate-800 truncate block">{lead.email}</span>
              </div>
              <div className="mt-2">
                <span className="text-[8px] font-bold text-slate-400 uppercase block">Property Interested</span>
                <span className="text-slate-800 font-bold bg-brand-50/50 border border-brand-100 px-2 py-0.5 rounded-lg text-[10px] inline-block">{lead.property || "None"}</span>
              </div>
              <div className="mt-2">
                <span className="text-[8px] font-bold text-slate-400 uppercase block">Acquisition Date</span>
                <span className="text-slate-600 font-mono text-[10px]">{lead.createdAtStr || "07 Jul 2026"}</span>
              </div>
            </div>
          </div>

          {/* Section B: Marketing/Ads Info */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">Section B: Ads Campaign Telemetry</h4>
            <div className="text-xs font-semibold text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Traffic Source</span>
                <span className="text-slate-800 bg-white border border-slate-200 px-2 py-0.5 rounded-lg font-bold">{lead.campaign || "Manual Entry"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Ad Set Name</span>
                <span className="text-slate-655 font-mono truncate max-w-[200px]">{lead.source || "Organic Leads Group"}</span>
              </div>
              <div className="flex justify-between items-start pt-1.5 border-t border-slate-100">
                <div className="min-w-0">
                  <span className="text-[9px] font-bold text-slate-450 uppercase block">Form Response Summary</span>
                  <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-0.5">
                    &quot;Looking for a 3BHK flat near Coimbatore outer ring road. Budget around ₹85 Lakhs. Prefer higher floors.&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section C: Status Update Action Area */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">Section C: Status &amp; Tasks Router</h4>
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-4">
              <div className="space-y-1">
                <label className="block text-[9px] font-bold text-slate-400 uppercase">Select Current Status</label>
                <select
                  value={localStatus}
                  onChange={handleStatusChange}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="New Lead">New Lead (Touchpoint)</option>
                  <option value="Assigned">Assigned to Agent</option>
                  <option value="Connected">Connected / Dialed</option>
                  <option value="Interested">Interested Client</option>
                  <option value="Follow-ups">Follow-up Callback</option>
                  <option value="Visit Schedule">Visit Scheduled</option>
                  <option value="Site Visit">Site Visit Completed</option>
                  <option value="Meeting Scheduled">Meeting Scheduled</option>
                  <option value="Meeting Done">Meeting Done</option>
                  <option value="In Negotiation">In Negotiation</option>
                  <option value="Booked">Booked Contract</option>
                  <option value="Completed">Completed Conversion</option>
                  <option value="Not Interested">Not Interested</option>
                  <option value="Low Budget">Low Budget</option>
                  <option value="Invalid">Invalid Details</option>
                  <option value="Dead">Dead Pipeline</option>
                </select>
              </div>

              {/* DYNAMIC DATE & TIME PICKER FOR REMINDERS */}
              {needsReminderPicker && (
                <form onSubmit={handleSaveReminder} className="space-y-3 pt-3 border-t border-slate-200 animate-fade-in">
                  <div className="flex items-center gap-1.5 text-[9px] font-extrabold text-brand-700 bg-brand-50 border border-brand-100 px-2.5 py-1 rounded-xl">
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
              )}
            </div>
          </div>

          {/* Section D: Activity Logs */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-slate-500" />
              Section D: Audit logs timeline
            </h4>
            <div className="space-y-4 relative border-l border-slate-150 pl-4 ml-2 max-h-60 overflow-y-auto pr-1">
              {lead.logs.length === 0 ? (
                <p className="text-[10px] text-slate-400 font-semibold italic">No activity registered for this profile.</p>
              ) : (
                lead.logs.map((log, idx) => (
                  <div key={idx} className="relative text-xs">
                    {/* Log Dot */}
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-slate-300 border border-white" />
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-bold text-slate-400">
                        <span>{log.user}</span>
                        <span className="font-mono">{log.timestamp}</span>
                      </div>
                      <p className="text-[10px] text-slate-650 font-bold leading-relaxed">{log.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
