"use client";

import React, { useState, useEffect } from "react";
import { X, Phone, MessageSquare, Mail, Copy, Check, User, FileText, ChevronDown } from "lucide-react";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";

interface LeadDetailDrawerProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (leadId: string, status: LeadStatus) => void;
  onReassignAgent?: (leadId: string, agentName: string) => void;
}

export default function LeadDetailDrawer({
  lead,
  isOpen,
  onClose,
  onUpdateStatus,
  onReassignAgent
}: LeadDetailDrawerProps) {
  const { users, reassignLead } = useApp();
  const [localStatus, setLocalStatus] = useState<LeadStatus>("New Lead");
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [reassignedAgent, setReassignedAgent] = useState<string>("Naveen Naik");

  const allSalesAgents = Array.from(new Set([
    ...users.filter(u => u.role === "AGENT" || u.role_type === "Member").map(u => u.name),
    "Naveen Naik",
    "Santosh Ray",
    "Gautham Karanam",
    "Sanjeev Kumar",
    "Partha Mazumdar",
    "Akhil Raj Singh",
    "Naveen Naidu",
    "Neha Chourey"
  ])).filter(Boolean);

  useEffect(() => {
    if (lead) {
      setLocalStatus(lead.status);
      setReassignedAgent("Naveen Naik");
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
    setReassignedAgent(newAgent);
    if (lead) {
      reassignLead(lead.id, newAgent);
      onReassignAgent?.(lead.id, newAgent);
    }
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
    if (navigator.clipboard) {
      navigator.clipboard.writeText(lead.email || "amanpratap1@gmail.com");
    }
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const leadEmail = lead.email || "amanpratap1@gmail.com";
  const assignedAgentName = lead.assignedAgent || (lead as any).assignedTo || "Santosh Ray";
  const reassignedAgentName = "Naveen Naik";
  const propertyName = lead.property || "Brigade Granada";
  const capturedAtStr = lead.createdAtStr || "20 Jun 2026 | 11:05 pm";

  // Timeline activity items matching user screenshot exactly
  const mockActivityLogs = [
    {
      id: "log1",
      dateBadge: "22 June 2026 | 11:23 am",
      message: "Show interest and site visit is scheduled on 25th June 2026 at 1 pm and require details on the same.",
      fromStatus: "Call Back",
      toStatus: "Follow Up",
      scheduled: "25 Jun 2026 | 11:00 am",
      actor: "Naveen Naik"
    },
    {
      id: "log2",
      dateBadge: "21 June 2026 | 08:21 pm",
      message: "Details are shared with customer, expected site visit by next weekend. He will be in bengaluru by friday. Asked to follow up tomorrow.",
      fromStatus: "Reassigned",
      toStatus: "Call Back",
      scheduled: "22 Jun 2026 | 11:20 am",
      actor: "Naveen Naik"
    },
    {
      id: "log3",
      dateBadge: "20 June 2026 | 11:30 am",
      message: "Lead interested in 2bhk under 1.5 Cr at Electronic City location. Prefer habulas oasis grove.",
      fromStatus: "Lead Captured",
      toStatus: "Reassigned",
      scheduled: null,
      actor: "Santosh Ray"
    },
    {
      id: "log4",
      dateBadge: "20 June 2026 | 11:18 am",
      message: `Lead assigned to ${assignedAgentName}.`,
      fromStatus: "Lead Captured",
      toStatus: null,
      scheduled: null,
      actor: lead.source || "Meta Ads"
    }
  ];

  return (
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
                  <p className="font-bold text-slate-800 border-b border-slate-100 pb-1 text-[11px]">Lead Notes</p>
                  <p className="text-slate-600 text-[10px] leading-relaxed">
                    Client prefers 3BHK flats with ready possession or handover by Dec 2026.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sub-header Metadata Row */}
          <div className="flex justify-between items-center text-[10px] text-slate-400 pb-1 border-b border-slate-100">
            <div>
              <span className="font-semibold text-slate-400">Last Updated : </span>
              <span className="font-medium text-slate-600">28 Jun 2026 | 10:34 am</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-slate-400">Source : </span>
              <span className="text-blue-600 font-bold text-xs">∞</span>
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
            <span className="font-black text-slate-900 block mb-0.5">Reassigned To :</span>
            <div className="relative inline-block mt-0.5">
              <select
                value={reassignedAgent}
                onChange={(e) => handleReassign(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 cursor-pointer pr-6 shadow-2xs"
              >
                {allSalesAgents.map(agent => (
                  <option key={agent} value={agent}>{agent}</option>
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

            {/* Timeline Scrollable Box matching Screenshot 2 */}
            <div className="rounded-2xl border border-slate-200/90 p-4 bg-slate-50/20 overflow-y-auto space-y-4 max-h-[380px]">
              <div className="relative border-l-2 border-slate-300 ml-3 pl-6 space-y-5">

                {mockActivityLogs.map((log) => (
                  <div key={log.id} className="relative">
                    {/* Circle Node Dot */}
                    <span className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-slate-400 bg-white" />
                    
                    {/* Date Pill Badge */}
                    <div className="inline-block bg-[#0B1E6E] text-white text-[10px] font-bold px-3 py-0.5 rounded-md mb-2 shadow-2xs">
                      {log.dateBadge}
                    </div>

                    {/* Message Bubble Card */}
                    <div className="bg-[#EBF7FE] border border-[#BBE2FB] rounded-xl p-3.5 space-y-3 shadow-2xs">
                      <p className="text-xs font-medium text-slate-800 leading-relaxed">
                        {log.message}
                      </p>
                      
                      <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1.5 border-t border-[#D0E9FA] font-medium">
                        <span>
                          {log.fromStatus} {log.toStatus && `→ ${log.toStatus}`}
                        </span>
                        {log.scheduled && (
                          <span>Scheduled : {log.scheduled}</span>
                        )}
                        <span>{log.actor}</span>
                      </div>
                    </div>
                  </div>
                ))}

              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
