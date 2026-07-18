import React from "react";
import { Phone, MessageSquare, Mail, Eye, Trash2, ShieldAlert, Award } from "lucide-react";
import { Lead, LeadStatus } from "@/context/AppContext";

interface LeadTableProps {
  leads: Lead[];
  onViewDetails: (lead: Lead) => void;
  onDelete: (leadId: string) => void;
  activeRole: string;
}

export default function LeadTable({
  leads,
  onViewDetails,
  onDelete,
  activeRole
}: LeadTableProps) {

  const getStatusColor = (status: LeadStatus) => {
    switch (status) {
      case "Booked":
      case "Booking Done":
      case "Booking Approved":
      case "Completed":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "New Lead":
      case "New Leads":
      case "New":
        return "bg-blue-50 text-blue-800 border-blue-200";
      case "Interested":
      case "Connected":
      case "EOI Customers":
        return "bg-indigo-50 text-indigo-850 border-indigo-200";
      case "Follow up":
      case "Follow-ups":
      case "Visit Schedule":
      case "Site Visit Scheduled":
      case "Meeting Scheduled":
        return "bg-amber-50 text-amber-800 border-amber-200";
      case "Dead":
      case "Invalid":
      case "Finance Rejected":
        return "bg-red-50 text-red-800 border-red-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const triggerCall = (phone: string, name: string) => {
    // API Integration Point: Wire up dialer system call action
    alert(`Dialing ${name} at ${phone}... Connecting cloud telephony...`);
    window.location.href = `tel:${phone}`;
  };

  const triggerWhatsApp = (phone: string, name: string) => {
    // API Integration Point: Open WhatsApp API chat
    const formattedPhone = phone.replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(`Hello ${name}, this is Gautham from TaskEzy regarding your real estate inquiry.`);
    window.open(`https://wa.me/${formattedPhone}?text=${msg}`, "_blank");
  };

  const triggerMail = (email: string, name: string) => {
    // API Integration Point: Open standard mail client
    const subject = encodeURIComponent("Property Inquiry Update - TaskEzy CRM");
    const body = encodeURIComponent(`Hi ${name},\n\nHope you are doing well...\n\nRegards,\nTaskEzy Team`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">
              <th className="p-4">Lead Name</th>
              <th className="p-4">Property</th>
              <th className="p-4">Assigned Agent</th>
              <th className="p-4">Status</th>
              <th className="p-4">AI Score</th>
              <th className="p-4 text-center">Quick Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-xs text-slate-700">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400 font-medium italic">
                  No matching lead accounts found in this partition.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => onViewDetails(lead)}
                  className="hover:bg-slate-50/50 cursor-pointer transition-colors group"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-700 font-bold shrink-0">
                        {lead.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-extrabold text-slate-800 truncate">{lead.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{lead.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded text-[9px] text-slate-600 font-bold">
                      {lead.property || "Unassigned Project"}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-slate-700">{lead.assignedAgent}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${getStatusColor(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 bg-slate-100 h-2 rounded-full overflow-hidden shrink-0 border border-slate-200">
                        <div
                          className={`h-full rounded-full ${
                            (lead.leadScore || 0) > 70
                              ? "bg-emerald-500"
                              : (lead.leadScore || 0) > 40
                                ? "bg-amber-500"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${lead.leadScore || 20}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-black text-slate-600">{lead.leadScore || 20}%</span>
                    </div>
                  </td>
                  <td className="p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2">
                      {/* Call Action */}
                      <button
                        onClick={() => triggerCall(lead.phone, lead.name)}
                        className="p-2 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 rounded-xl text-slate-400 hover:text-emerald-700 transition-all"
                        title="Telephony Call"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </button>

                      {/* WhatsApp Action */}
                      <button
                        onClick={() => triggerWhatsApp(lead.phone, lead.name)}
                        className="p-2 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 rounded-xl text-slate-400 hover:text-emerald-700 transition-all"
                        title="WhatsApp Chat"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </button>

                      {/* Mail Action */}
                      <button
                        onClick={() => triggerMail(lead.email, lead.name)}
                        className="p-2 hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded-xl text-slate-400 hover:text-blue-700 transition-all"
                        title="Send Mail"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </button>

                      {/* View Details Action */}
                      <button
                        onClick={() => onViewDetails(lead)}
                        className="p-2 hover:bg-brand-50 border border-transparent hover:border-brand-200 rounded-xl text-slate-400 hover:text-brand-700 transition-all"
                        title="View Full Profile"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete Action (Admin Only) */}
                      {activeRole === "ADMIN" && (
                        <button
                          onClick={() => onDelete(lead.id)}
                          className="p-2 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-xl text-slate-400 hover:text-red-650 transition-all opacity-0 group-hover:opacity-100"
                          title="Delete Lead"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
