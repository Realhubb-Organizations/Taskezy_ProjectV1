"use client";

import React, { useMemo, useState } from "react";
import { useApp, Property, PropertyTeamAssignmentMode, LeadAssignmentMode, PropertyTeamMember } from "@/context/AppContext";
import {
  Search,
  Building,
  Plus,
  Eye,
  MessageCircle,
  Edit,
  Copy,
  Trash2,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  Users,
  Info
} from "lucide-react";
import AddPropertyModal from "@/components/properties/AddPropertyModal";
import MetaCampaignLinker from "@/components/properties/MetaCampaignLinker";
import GoogleCampaignLinker from "@/components/properties/GoogleCampaignLinker";
import SheetSourceLinker from "@/components/properties/SheetSourceLinker";

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100];

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function PropertiesPage() {
  const { properties, users, deleteProperty, editProperty, activeRole } = useApp();
  const isAdmin = activeRole === "ADMIN";

  // Drawer (view/edit) state
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Search / filter / sort / pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("All Types");
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);

  // Add / Duplicate modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<Property | null>(null);

  // Property interest form (drawer)
  const [interestName, setInterestName] = useState("");
  const [interestPhone, setInterestPhone] = useState("");
  const [interestEmail, setInterestEmail] = useState("");
  const [interestSuccess, setInterestSuccess] = useState("");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDev, setEditDev] = useState("");
  const [editLoc, setEditLoc] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editType, setEditType] = useState("Apartment");
  const [editStatus, setEditStatus] = useState("");
  const [editPossessionDate, setEditPossessionDate] = useState("");
  const [editLeadRegUrl, setEditLeadRegUrl] = useState("");
  const [editContactNumber, setEditContactNumber] = useState("");
  const [editMapUrl, setEditMapUrl] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTeamAssignmentMode, setEditTeamAssignmentMode] = useState<PropertyTeamAssignmentMode>("ALL_MEMBERS");
  const [editLeadAssignmentMode, setEditLeadAssignmentMode] = useState<LeadAssignmentMode>("ROUND_ROBIN");
  const [editSelectedMemberIds, setEditSelectedMemberIds] = useState<string[]>([]);
  const [editMemberPercentages, setEditMemberPercentages] = useState<Record<string, number>>({});
  const [successMsg, setSuccessMsg] = useState("");

  const salesTeam = users.filter(u => u.department === "SALES" && u.role !== "ADMIN");
  const editPercentageTotal = editSelectedMemberIds.reduce((sum, id) => sum + (editMemberPercentages[id] || 0), 0);

  const toggleEditMember = (userId: string) => {
    setEditSelectedMemberIds(prev => (prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]));
  };

  const types = ["All Types", ...Array.from(new Set(properties.map(p => p.type)))];

  const teamLabelForProperty = (p: Property): string => {
    if (p.teamAssignmentMode === "CUSTOM_MEMBERS" && p.assignedTeam && p.assignedTeam.length > 0) {
      return p.assignedTeam.length === 1 ? p.assignedTeam[0].name : `${p.assignedTeam.length} Members`;
    }
    return "All Members";
  };

  const openDrawer = (p: Property, editMode: boolean) => {
    setSelectedProperty(p);
    setIsEditing(editMode);
    setEditName(p.name);
    setEditDev(p.developer);
    setEditLoc(p.location);
    setEditPrice(p.price || "");
    setEditType(p.type || "Apartment");
    setEditStatus(p.propertyStatus || "");
    setEditPossessionDate(p.possessionDate || "");
    setEditLeadRegUrl(p.leadRegistrationUrl || "");
    setEditContactNumber(p.contactNumber || "");
    setEditMapUrl(p.mapUrl || "");
    setEditDesc(p.description || "");
    setEditTeamAssignmentMode(p.teamAssignmentMode || "ALL_MEMBERS");
    setEditLeadAssignmentMode(p.leadAssignmentMode || "ROUND_ROBIN");
    setEditSelectedMemberIds((p.assignedTeam || []).map(m => m.userId));
    setEditMemberPercentages(Object.fromEntries((p.assignedTeam || []).map(m => [m.userId, m.percentage || 0])));
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => {
      setSelectedProperty(null);
      setIsEditing(false);
    }, 200);
  };

  const handleContactProperty = (p: Property) => {
    if (!p.contactNumber) {
      alert("No contact number is set for this property yet.");
      return;
    }
    window.open(`tel:${p.contactNumber}`, "_self");
  };

  const handleDuplicateProperty = (p: Property) => {
    setDuplicateSource(p);
    setIsAddOpen(true);
  };

  const handleDownloadProperty = (p: Property) => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const filteredProperties = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = properties.filter(p => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.developer.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q);
      const matchesType = selectedType === "All Types" || p.type === selectedType;
      return matchesSearch && matchesType;
    });
    return filtered.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortDir === "asc" ? aTime - bTime : bTime - aTime;
    });
  }, [properties, searchQuery, selectedType, sortDir]);

  const totalRows = filteredProperties.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const clampedPage = Math.min(currentPage, totalPages);
  const pageStart = (clampedPage - 1) * rowsPerPage;
  const pageRows = filteredProperties.slice(pageStart, pageStart + rowsPerPage);

  const handleRegisterInterest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!interestName || !interestPhone) {
      alert("Name and phone number are required.");
      return;
    }
    setInterestSuccess("Thank you! Your interest has been successfully registered. An agent will contact you shortly.");
    setInterestName("");
    setInterestPhone("");
    setInterestEmail("");
    setTimeout(() => setInterestSuccess(""), 5000);
  };

  const handlePropertyCreated = (name: string) => {
    setDuplicateSource(null);
    setSuccessMsg(`Successfully created property: ${name}`);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const handleSavePropertyEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty) return;

    if (editTeamAssignmentMode === "CUSTOM_MEMBERS" && editSelectedMemberIds.length === 0) {
      alert("Select at least one team member, or switch to All Members.");
      return;
    }
    if (editTeamAssignmentMode === "CUSTOM_MEMBERS" && editLeadAssignmentMode === "PERCENTAGE" && editPercentageTotal !== 100) {
      if (!confirm(`Selected member percentages add up to ${editPercentageTotal}%, not 100%. Save anyway?`)) return;
    }

    const assignedTeam: PropertyTeamMember[] =
      editTeamAssignmentMode === "CUSTOM_MEMBERS"
        ? editSelectedMemberIds.map(id => {
            const member = salesTeam.find(u => u.id === id);
            return {
              userId: id,
              name: member?.name || "Unknown",
              percentage: editLeadAssignmentMode === "PERCENTAGE" ? editMemberPercentages[id] || 0 : undefined
            };
          })
        : [];

    editProperty(selectedProperty.id, {
      name: editName,
      developer: editDev,
      location: editLoc,
      price: editPrice,
      type: editType,
      propertyStatus: editStatus || undefined,
      possessionDate: editPossessionDate || undefined,
      leadRegistrationUrl: editLeadRegUrl || undefined,
      contactNumber: editContactNumber || undefined,
      mapUrl: editMapUrl || undefined,
      description: editDesc,
      teamAssignmentMode: editTeamAssignmentMode,
      leadAssignmentMode: editTeamAssignmentMode === "CUSTOM_MEMBERS" ? editLeadAssignmentMode : undefined,
      assignedTeam
    });

    setSuccessMsg(`Successfully updated property: ${editName}`);
    closeDrawer();
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const handleDeleteProperty = (p: Property) => {
    if (confirm(`Are you sure you want to delete "${p.name}"?`)) {
      deleteProperty(p.id);
      setSuccessMsg("Property deleted successfully.");
      if (selectedProperty?.id === p.id) closeDrawer();
      setTimeout(() => setSuccessMsg(""), 4000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Properties</h2>
        {isAdmin && (
          <button
            onClick={() => { setDuplicateSource(null); setIsAddOpen(true); }}
            className="inline-flex items-center gap-1.5 bg-brand-800 hover:bg-brand-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-brand-800/15"
          >
            <Plus className="h-4 w-4" />
            Add Property
          </button>
        )}
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-bold flex items-center gap-2 animate-fade-in shadow-sm">
          <Info className="h-4.5 w-4.5" />
          {successMsg}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search properties by name, builder, or location..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-xs focus:outline-none focus:border-brand-400 shadow-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                <th className="p-3.5">Properties</th>
                <th className="p-3.5">Property Location</th>
                <th className="p-3.5">
                  <div className="relative inline-block">
                    <button
                      onClick={() => setIsTypeMenuOpen(v => !v)}
                      className="flex items-center gap-1 hover:text-slate-700"
                    >
                      Property Type <ChevronDown className="h-3 w-3" />
                    </button>
                    {isTypeMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsTypeMenuOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 w-40 normal-case">
                          {types.map(t => (
                            <button
                              key={t}
                              onClick={() => { setSelectedType(t); setIsTypeMenuOpen(false); setCurrentPage(1); }}
                              className={`w-full text-left px-3 py-1.5 text-[11px] font-semibold hover:bg-slate-50 ${
                                selectedType === t ? "text-brand-700 bg-brand-50/60" : "text-slate-600"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </th>
                <th className="p-3.5">Price</th>
                <th className="p-3.5">
                  <button
                    onClick={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))}
                    className="flex items-center gap-1 hover:text-slate-700"
                  >
                    Date <ChevronDown className={`h-3 w-3 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} />
                  </button>
                </th>
                <th className="p-3.5">Assigned To</th>
                <th className="p-3.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-semibold italic">
                    No properties match the current filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5">
                      <button onClick={() => openDrawer(p, false)} className="text-left group">
                        <span className="block font-bold text-slate-800 group-hover:text-brand-700 transition-colors">{p.developer}</span>
                        <span className="block text-[11px] text-slate-450">{p.name}</span>
                      </button>
                    </td>
                    <td className="p-3.5 text-slate-600">{p.location || "—"}</td>
                    <td className="p-3.5 text-slate-600">{p.type}</td>
                    <td className="p-3.5 font-semibold text-slate-800">{p.price ? `${p.price}*` : "—"}</td>
                    <td className="p-3.5 text-slate-500 whitespace-nowrap">{formatDateTime(p.createdAt)}</td>
                    <td className="p-3.5 text-slate-600">{teamLabelForProperty(p)}</td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openDrawer(p, false)} className="p-1.5 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="View details">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleContactProperty(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="Contact">
                          <MessageCircle className="h-3.5 w-3.5" />
                        </button>
                        {isAdmin && (
                          <button onClick={() => openDrawer(p, true)} className="p-1.5 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="Edit">
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDuplicateProperty(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="Duplicate">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDeleteProperty(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDownloadProperty(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="Download">
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-[11px] text-slate-500">
          <span className="font-semibold">{totalRows} Rows</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span>Rows per page:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-transparent border border-slate-200 rounded-md px-1.5 py-0.5 text-[11px] font-semibold focus:outline-none"
              >
                {ROWS_PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <span>
              {totalRows === 0 ? "0-0" : `${pageStart + 1}-${Math.min(pageStart + rowsPerPage, totalRows)}`} of {totalRows}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={clampedPage <= 1}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Detail / Edit Drawer */}
      {selectedProperty && (
        <>
          <div
            className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity duration-200 ${isDrawerOpen ? "opacity-100" : "opacity-0"}`}
            onClick={closeDrawer}
          />
          <div
            className={`fixed top-0 right-0 h-full w-full sm:w-[26rem] bg-white shadow-2xl z-50 overflow-y-auto transition-transform duration-200 ${
              isDrawerOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-brand-600 uppercase tracking-wider">{selectedProperty.developer}</span>
                  <h3 className="text-lg font-bold text-slate-800 mt-0.5">{selectedProperty.name}</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {selectedProperty.location}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && (
                    <button onClick={() => setIsEditing(!isEditing)} className="text-slate-400 hover:text-brand-600 transition-colors p-1" title="Toggle Edit Mode">
                      <Edit className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={closeDrawer} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {isEditing && isAdmin ? (
                <form onSubmit={handleSavePropertyEdit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Name</label>
                    <input type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Builder Name</label>
                    <input type="text" required value={editDev} onChange={(e) => setEditDev(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Type</label>
                      <select value={editType} onChange={(e) => setEditType(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none">
                        <option>Apartment</option>
                        <option>Villa</option>
                        <option>Plot</option>
                        <option>Commercial</option>
                        <option>Residential</option>
                        <option>Mixed-Use</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Status</label>
                      <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none">
                        <option value="">Select status</option>
                        <option>Pre-Launch</option>
                        <option>Under Construction</option>
                        <option>Ready to Move</option>
                        <option>Sold Out</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Possession Date</label>
                      <input type="date" value={editPossessionDate} onChange={(e) => setEditPossessionDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Quoted Price</label>
                      <input type="text" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none font-mono" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Lead Registration URL</label>
                    <input type="text" value={editLeadRegUrl} onChange={(e) => setEditLeadRegUrl(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Contact Number</label>
                    <input type="tel" value={editContactNumber} onChange={(e) => setEditContactNumber(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Location</label>
                      <input type="text" required value={editLoc} onChange={(e) => setEditLoc(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Map URL</label>
                      <input type="text" value={editMapUrl} onChange={(e) => setEditMapUrl(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Description</label>
                    <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                  </div>

                  <div className="border-t border-slate-200 pt-4 space-y-3">
                    <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-slate-500" /> Team Access Settings
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setEditTeamAssignmentMode("ALL_MEMBERS")} className={`p-2.5 rounded-lg text-[11px] font-bold border transition-all text-left ${editTeamAssignmentMode === "ALL_MEMBERS" ? "bg-brand-50 border-brand-300 text-brand-700" : "bg-white border-slate-200 text-slate-500"}`}>
                        All Members
                      </button>
                      <button type="button" onClick={() => setEditTeamAssignmentMode("CUSTOM_MEMBERS")} className={`p-2.5 rounded-lg text-[11px] font-bold border transition-all text-left ${editTeamAssignmentMode === "CUSTOM_MEMBERS" ? "bg-brand-50 border-brand-300 text-brand-700" : "bg-white border-slate-200 text-slate-500"}`}>
                        Custom Members
                      </button>
                    </div>

                    {editTeamAssignmentMode === "CUSTOM_MEMBERS" && (
                      <div className="space-y-3 animate-fade-in">
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => setEditLeadAssignmentMode("ROUND_ROBIN")} className={`p-2 rounded-lg text-[10px] font-bold border transition-all ${editLeadAssignmentMode === "ROUND_ROBIN" ? "bg-brand-50 border-brand-300 text-brand-700" : "bg-white border-slate-200 text-slate-500"}`}>
                            Round Robin
                          </button>
                          <button type="button" onClick={() => setEditLeadAssignmentMode("PERCENTAGE")} className={`p-2 rounded-lg text-[10px] font-bold border transition-all ${editLeadAssignmentMode === "PERCENTAGE" ? "bg-brand-50 border-brand-300 text-brand-700" : "bg-white border-slate-200 text-slate-500"}`}>
                            Percentage Split
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase">Select Sales Team</label>
                          {editLeadAssignmentMode === "PERCENTAGE" && (
                            <span className={`text-[9px] font-bold ${editPercentageTotal === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                              Total: {editPercentageTotal}%
                            </span>
                          )}
                        </div>
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                          {salesTeam.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic p-3">No sales team members yet.</p>
                          ) : (
                            salesTeam.map(member => {
                              const isChecked = editSelectedMemberIds.includes(member.id);
                              return (
                                <div key={member.id} className="flex items-center justify-between p-2 hover:bg-slate-50">
                                  <label className="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
                                    <input type="checkbox" checked={isChecked} onChange={() => toggleEditMember(member.id)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                                    <span className="min-w-0">
                                      <span className="block text-[11px] font-bold text-slate-800 truncate">{member.name}</span>
                                      <span className="block text-[9px] text-slate-450">{member.role_type === "Manager" ? "Sales Manager / TL" : "Sales Agent"}</span>
                                    </span>
                                  </label>
                                  {isChecked && editLeadAssignmentMode === "PERCENTAGE" && (
                                    <input type="number" min={0} max={100} value={editMemberPercentages[member.id] ?? 0} onChange={(e) => setEditMemberPercentages(prev => ({ ...prev, [member.id]: Number(e.target.value) }))} className="w-16 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] text-right font-mono focus:outline-none" />
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <MetaCampaignLinker propertyId={selectedProperty.id} isAdmin={isAdmin} />
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <GoogleCampaignLinker propertyId={selectedProperty.id} isAdmin={isAdmin} />
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <SheetSourceLinker propertyId={selectedProperty.id} isAdmin={isAdmin} />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="flex-1 bg-brand-700 hover:bg-brand-600 text-white font-bold py-2 rounded-lg text-xs transition-all shadow-sm">
                      Save Changes
                    </button>
                    <button type="button" onClick={() => handleDeleteProperty(selectedProperty)} className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-center">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-slate-450 block mb-0.5">Project Status</span>
                      <span className="font-bold text-slate-800">{selectedProperty.propertyStatus || "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-450 block mb-0.5">Possession Date</span>
                      <span className="font-bold text-slate-800">{selectedProperty.possessionDate || "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-450 block mb-0.5">Added On</span>
                      <span className="font-bold text-slate-800">{formatDateTime(selectedProperty.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-slate-450 block mb-0.5">Assigned Team</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        <Users className="h-3 w-3 text-slate-400" />
                        {teamLabelForProperty(selectedProperty)}
                      </span>
                    </div>
                    {selectedProperty.teamAssignmentMode === "CUSTOM_MEMBERS" && selectedProperty.leadAssignmentMode && (
                      <div className="col-span-2">
                        <span className="text-slate-450 block mb-0.5">Lead Assignment Mode</span>
                        <span className="font-bold text-slate-800">{selectedProperty.leadAssignmentMode === "ROUND_ROBIN" ? "Round Robin" : "Percentage Split"}</span>
                      </div>
                    )}
                    <div className="col-span-2 border-t border-slate-200 pt-2 mt-1">
                      <span className="text-slate-450 block mb-0.5">Quoted Price</span>
                      <span className="font-bold text-brand-700 font-mono text-sm">{selectedProperty.price ? `${selectedProperty.price}*` : "Contact for pricing"}</span>
                    </div>
                  </div>

                  {selectedProperty.description && (
                    <div className="space-y-1.5 text-xs leading-relaxed">
                      <span className="font-bold text-slate-700 block">About Project</span>
                      <p className="text-slate-600 whitespace-pre-line">{selectedProperty.description}</p>
                    </div>
                  )}

                  <div className="border-t border-slate-200 pt-4">
                    <MetaCampaignLinker propertyId={selectedProperty.id} isAdmin={isAdmin} />
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <GoogleCampaignLinker propertyId={selectedProperty.id} isAdmin={isAdmin} />
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <SheetSourceLinker propertyId={selectedProperty.id} isAdmin={isAdmin} />
                  </div>

                  <div className="border-t border-slate-200 pt-4 space-y-4">
                    <div>
                      <span className="font-bold text-slate-800 block text-xs">Register Client Interest</span>
                      <p className="text-[10px] text-slate-500 mt-0.5">Register client details directly to initiate lead follow-up logs.</p>
                    </div>

                    {interestSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-100 text-[10px] text-emerald-700 rounded-lg font-semibold">
                        {interestSuccess}
                      </div>
                    )}

                    <form onSubmit={handleRegisterInterest} className="space-y-3">
                      <input type="text" required placeholder="Client Name" value={interestName} onChange={(e) => setInterestName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                      <input type="tel" required placeholder="Phone Number" value={interestPhone} onChange={(e) => setInterestPhone(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                      <input type="email" placeholder="Email address (optional)" value={interestEmail} onChange={(e) => setInterestEmail(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
                      <button type="submit" className="w-full py-2 bg-brand-700 hover:bg-brand-600 text-white font-bold rounded-lg text-xs transition-all shadow-sm">
                        Register Interest
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Add / Duplicate Property Modal */}
      <AddPropertyModal
        isOpen={isAddOpen}
        onClose={() => { setIsAddOpen(false); setDuplicateSource(null); }}
        onSuccess={handlePropertyCreated}
        duplicateFrom={duplicateSource}
      />
    </div>
  );
}
