import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Phone, MessageSquare, Mail, Eye, Trash2, ShieldAlert, Award, Search, X, Copy, Check } from "lucide-react";
import { Lead, LeadStatus } from "@/context/AppContext";

const CopyablePhone = ({ phone }: { phone: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phone);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 font-mono mt-0.5">
      <span>{phone}</span>
      <button 
        onClick={handleCopy}
        title="Copy phone number"
        className="p-0.5 hover:text-slate-800 text-slate-400 transition-colors cursor-pointer bg-transparent border-none"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500 shrink-0" />
        ) : (
          <Copy className="h-3 w-3 text-slate-400 hover:text-slate-600 shrink-0" />
        )}
      </button>
    </span>
  );
};

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
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");

  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);
  const [propertySearch, setPropertySearch] = useState("");

  const allAgentsList = Array.from(new Set(leads.map(l => l.assignedAgent).filter(Boolean)));

  const allPropertiesList: string[] = Array.from(new Set(leads.map(l => l.property).filter((p): p is string => Boolean(p))));

  const displayedLeads = leads.filter(l => {
    const matchesSearch = !searchQuery || l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.phone.includes(searchQuery);
    const matchesAgent = selectedAgent === "all" || l.assignedAgent === selectedAgent;
    const matchesProp = selectedProperty === "all" || l.property === selectedProperty;
    return matchesSearch && matchesAgent && matchesProp;
  });

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
      {/* Mobile: stacked cards — a 6-column table cramped into a phone width
          reads as tiny, truncated text; a card per lead reads like a native
          app list instead. */}
      <div className="md:hidden divide-y divide-slate-100">
        {leads.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-medium italic text-xs">
            No matching lead accounts found in this partition.
          </div>
        ) : (
          leads.map((lead) => (
            <div key={lead.id} onClick={() => onViewDetails(lead)} className="p-4 space-y-3 active:bg-slate-50 cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-700 font-bold shrink-0">
                  {lead.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-slate-800 text-xs truncate">{lead.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{lead.phone}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0 ${getStatusColor(lead.status)}`}>
                  {lead.status}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] gap-2">
                <span className="bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded text-slate-600 font-bold truncate">
                  {lead.property || "Unassigned Project"}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-slate-600 font-semibold truncate max-w-[100px]">{lead.assignedAgent}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200">
                  <div
                    className={`h-full rounded-full ${
                      (lead.leadScore || 0) > 70 ? "bg-emerald-500" : (lead.leadScore || 0) > 40 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${lead.leadScore ?? 0}%` }}
                  />
                </div>
                <span className="text-[9px] font-black text-slate-500 shrink-0">
                  {lead.leadScore != null ? `${lead.leadScore}% AI Score` : "Not scored"}
                </span>
              </div>

              <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => triggerCall(lead.phone, lead.name)}
                  className="p-2 hover:bg-emerald-50 rounded-xl text-slate-400 hover:text-emerald-700 transition-all"
                  title="Telephony Call"
                >
                  <Phone className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => triggerWhatsApp(lead.phone, lead.name)}
                  className="p-2 hover:bg-emerald-50 rounded-xl text-slate-400 hover:text-emerald-700 transition-all"
                  title="WhatsApp Chat"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => triggerMail(lead.email, lead.name)}
                  className="p-2 hover:bg-blue-50 rounded-xl text-slate-400 hover:text-blue-700 transition-all"
                  title="Send Mail"
                >
                  <Mail className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onViewDetails(lead)}
                  className="p-2 hover:bg-brand-50 rounded-xl text-slate-400 hover:text-brand-700 transition-all"
                  title="View Full Profile"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                {activeRole === "ADMIN" && (
                  <button
                    onClick={() => onDelete(lead.id)}
                    className="p-2 hover:bg-red-50 rounded-xl text-slate-400 hover:text-red-650 transition-all"
                    title="Delete Lead"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop: full table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">
              <th className="p-4">
                {showSearch ? (
                  <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 shadow-sm w-44">
                    <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-transparent text-xs font-semibold text-slate-800 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                      autoFocus
                    />
                    <X
                      className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearchQuery("");
                        setShowSearch(false);
                      }}
                    />
                  </div>
                ) : (
                  <div 
                    className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800 transition-colors select-none"
                    onClick={() => setShowSearch(true)}
                  >
                    <span>Lead Name</span>
                    <Search className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600" />
                  </div>
                )}
              </th>
              <th className="p-4 relative">
                <div 
                  className="flex items-center gap-1 cursor-pointer select-none hover:text-slate-800 transition-colors"
                  onClick={() => setShowPropertyDropdown(!showPropertyDropdown)}
                >
                  <span>Property</span>
                  <span className="text-[8px]">▼</span>
                  {selectedProperty !== "all" && (
                    <span className="bg-blue-600 text-white text-[9px] rounded-full px-1.5 py-0.2 font-bold ml-0.5">
                      1
                    </span>
                  )}
                </div>

                {showPropertyDropdown && (
                  <>
                    {createPortal(
                      <div
                        className="fixed inset-0 z-20 cursor-default"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPropertyDropdown(false);
                        }}
                      />,
                      document.body
                    )}
                    <div className="absolute left-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-3 space-y-2 normal-case text-slate-700 font-medium text-xs">
                      <div className="flex justify-between items-center pb-1.5 border-b border-slate-100 text-[10px] text-slate-400 font-bold">
                        <span>Filter Property</span>
                        {selectedProperty !== "all" && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProperty("all");
                            }}
                            className="text-blue-600 hover:underline cursor-pointer bg-transparent border-none font-bold"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="text"
                          placeholder="Search property..."
                          value={propertySearch}
                          onChange={(e) => setPropertySearch(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                          autoFocus
                        />
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-slate-700">
                        <button
                          onClick={() => {
                            setSelectedProperty("all");
                            setShowPropertyDropdown(false);
                          }}
                          className={`w-full text-left px-2 py-1 rounded text-xs font-semibold ${selectedProperty === "all" ? "bg-blue-50 text-blue-700 font-bold" : "hover:bg-slate-50 text-slate-700"}`}
                        >
                          All Properties
                        </button>
                        {allPropertiesList.filter(p => p.toLowerCase().includes(propertySearch.toLowerCase())).map((prop) => (
                          <button
                            key={prop}
                            onClick={() => {
                              setSelectedProperty(prop);
                              setShowPropertyDropdown(false);
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs font-semibold ${selectedProperty === prop ? "bg-blue-50 text-blue-700 font-bold" : "hover:bg-slate-50 text-slate-700"}`}
                          >
                            {prop}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </th>
              <th className="p-4 relative">
                <div 
                  className="flex items-center gap-1 cursor-pointer select-none hover:text-slate-800 transition-colors"
                  onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                >
                  <span>Assigned Agent</span>
                  <span className="text-[8px]">▼</span>
                  {selectedAgent !== "all" && (
                    <span className="bg-blue-600 text-white text-[9px] rounded-full px-1.5 py-0.2 font-bold ml-0.5">
                      1
                    </span>
                  )}
                </div>

                {showAgentDropdown && (
                  <>
                    {createPortal(
                      <div
                        className="fixed inset-0 z-20 cursor-default"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAgentDropdown(false);
                        }}
                      />,
                      document.body
                    )}
                    <div className="absolute left-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-3 space-y-2 normal-case text-slate-700 font-medium text-xs">
                      <div className="flex justify-between items-center pb-1.5 border-b border-slate-100 text-[10px] text-slate-400 font-bold">
                        <span>Filter Sales Agent</span>
                        {selectedAgent !== "all" && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAgent("all");
                            }}
                            className="text-blue-600 hover:underline cursor-pointer bg-transparent border-none font-bold"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="text"
                          placeholder="Search agent..."
                          value={agentSearch}
                          onChange={(e) => setAgentSearch(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                          autoFocus
                        />
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-slate-700">
                        <button
                          onClick={() => {
                            setSelectedAgent("all");
                            setShowAgentDropdown(false);
                          }}
                          className={`w-full text-left px-2 py-1 rounded text-xs font-semibold ${selectedAgent === "all" ? "bg-blue-50 text-blue-700 font-bold" : "hover:bg-slate-50 text-slate-700"}`}
                        >
                          All Sales Agents
                        </button>
                        {allAgentsList.filter(a => a.toLowerCase().includes(agentSearch.toLowerCase())).map((agent) => (
                          <button
                            key={agent}
                            onClick={() => {
                              setSelectedAgent(agent);
                              setShowAgentDropdown(false);
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs font-semibold ${selectedAgent === agent ? "bg-blue-50 text-blue-700 font-bold" : "hover:bg-slate-50 text-slate-700"}`}
                          >
                            {agent}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </th>
              <th className="p-4">Status</th>
              <th className="p-4">AI Score</th>
              <th className="p-4 text-center">Quick Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-xs text-slate-700">
            {displayedLeads.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400 font-medium italic">
                  No matching lead accounts found in this partition.
                </td>
              </tr>
            ) : (
              displayedLeads.map((lead) => (
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
                        <CopyablePhone phone={lead.phone} />
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
                          style={{ width: `${lead.leadScore ?? 0}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-black text-slate-600">
                        {lead.leadScore != null ? `${lead.leadScore}%` : "—"}
                      </span>
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
