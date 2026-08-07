"use client";

import React, { useState } from "react";
import { useApp, Property } from "@/context/AppContext";
import { Search, Info, MapPin, Building, Edit, Trash2, Users, Plus } from "lucide-react";
import AddPropertyModal from "@/components/properties/AddPropertyModal";
import MetaCampaignLinker from "@/components/properties/MetaCampaignLinker";

export default function PropertiesPage() {
  const { properties, deleteProperty, editProperty, activeRole } = useApp();
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Search & Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBuilder, setSelectedBuilder] = useState("All");
  const [selectedZone, setSelectedZone] = useState("All");
  const [selectedType, setSelectedType] = useState("All Types");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("All");

  // Property interest form
  const [interestName, setInterestName] = useState("");
  const [interestPhone, setInterestPhone] = useState("");
  const [interestEmail, setInterestEmail] = useState("");
  const [interestSuccess, setInterestSuccess] = useState("");

  // Add Property modal state
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Edit Property states
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDev, setEditDev] = useState("");
  const [editZone, setEditZone] = useState("");
  const [editLoc, setEditLoc] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editType, setEditType] = useState("Apartment");
  const [editDesc, setEditDesc] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Extract unique builders/zones/types for filters
  const builders = ["All", ...Array.from(new Set(properties.map(p => p.developer)))];
  const zones = ["All", ...Array.from(new Set(properties.map(p => p.zone).filter(Boolean)))] as string[];
  const types = ["All Types", ...Array.from(new Set(properties.map(p => p.type)))];
  const teamFilterOptions = [
    "All",
    "All Members",
    ...Array.from(new Set(properties.flatMap(p => (p.assignedTeam || []).map(m => m.name))))
  ];

  const handleSelectProperty = (p: Property) => {
    setSelectedProperty(p);
    setIsEditing(false);
    setEditName(p.name);
    setEditDev(p.developer);
    setEditZone(p.zone || "");
    setEditLoc(p.location);
    setEditPrice(p.price || "");
    setEditType(p.type || "Apartment");
    setEditDesc(p.description || "");
  };

  const handleEditProperty = (p: Property) => {
    setSelectedProperty(p);
    setIsEditing(true);
    setEditName(p.name);
    setEditDev(p.developer);
    setEditZone(p.zone || "");
    setEditLoc(p.location);
    setEditPrice(p.price || "");
    setEditType(p.type || "Apartment");
    setEditDesc(p.description || "");
  };

  const teamLabelForProperty = (p: Property): string => {
    if (p.teamAssignmentMode === "CUSTOM_MEMBERS" && p.assignedTeam && p.assignedTeam.length > 0) {
      return p.assignedTeam.length === 1 ? p.assignedTeam[0].name : `${p.assignedTeam.length} members`;
    }
    return "All Members";
  };

  const filteredProperties = properties.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.developer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.locality || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.zone || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBuilder = selectedBuilder === "All" || p.developer === selectedBuilder;
    const matchesZone = selectedZone === "All" || p.zone === selectedZone;
    const matchesType = selectedType === "All Types" || p.type === selectedType;
    const matchesTeam =
      selectedTeamFilter === "All" ||
      (selectedTeamFilter === "All Members" && (p.teamAssignmentMode === "ALL_MEMBERS" || !p.teamAssignmentMode)) ||
      (p.assignedTeam || []).some(m => m.name === selectedTeamFilter);
    return matchesSearch && matchesBuilder && matchesZone && matchesType && matchesTeam;
  });

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
    setSuccessMsg(`Successfully created property: ${name}`);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const handleSavePropertyEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty) return;

    editProperty(selectedProperty.id, {
      name: editName,
      developer: editDev,
      zone: editZone,
      location: editLoc,
      price: editPrice,
      type: editType,
      description: editDesc
    });

    setSuccessMsg(`Successfully updated property: ${editName}`);
    setIsEditing(false);
    setSelectedProperty(null);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const handleDeleteProperty = (propertyId: string) => {
    if (confirm("Are you sure you want to delete this property?")) {
      deleteProperty(propertyId);
      setSuccessMsg("Property deleted successfully.");
      setSelectedProperty(null);
      setTimeout(() => setSuccessMsg(""), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
            <Building className="h-5.5 w-5.5 text-brand-600" />
            Properties Database
          </h2>
          <p className="text-xs text-slate-500">
            View property portfolios, map locality zones, and manage broker rates.
          </p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-1.5 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md shadow-brand-700/10"
        >
          <Plus className="h-4 w-4" />
          Add Property
        </button>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-bold flex items-center gap-2 animate-fade-in shadow-sm">
          <Info className="h-4.5 w-4.5" />
          {successMsg}
        </div>
      )}

      {/* Filter and Search Panel */}
      <div className="glass-card p-4 rounded-xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search property, builder, locality..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none"
            />
          </div>

          {/* Builder filter */}
          <div>
            <select
              value={selectedBuilder}
              onChange={(e) => setSelectedBuilder(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
            >
              {builders.map(b => (
                <option key={b} value={b}>{b === "All" ? "All Builders" : b}</option>
              ))}
            </select>
          </div>

          {/* Zone filter */}
          <div>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
            >
              {zones.map(z => (
                <option key={z} value={z}>{z === "All" ? "All Zones" : z}</option>
              ))}
            </select>
          </div>

          {/* Type filter */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
            >
              {types.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Team filter */}
          <div>
            <select
              value={selectedTeamFilter}
              onChange={(e) => setSelectedTeamFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
            >
              {teamFilterOptions.map(t => (
                <option key={t} value={t}>{t === "All" ? "All Teams" : t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left list */}
        <div className="lg:col-span-8 glass-card p-6 rounded-2xl">
          {/* Desktop/tablet: compact table, no horizontal scroll */}
          <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-left text-[11px] border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="p-2.5 w-[18%]">Property</th>
                  <th className="p-2.5 w-[13%]">Builder</th>
                  <th className="p-2.5 w-[18%]">Location</th>
                  <th className="p-2.5 w-[12%]">Type</th>
                  <th className="p-2.5 w-[13%]">Price</th>
                  <th className="p-2.5 w-[14%]">Team</th>
                  <th className="p-2.5 w-[12%] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProperties.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400 font-semibold italic">
                      No properties match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredProperties.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-2.5 font-bold text-slate-800 truncate">{p.name}</td>
                      <td className="p-2.5 text-slate-655 font-semibold truncate">{p.developer}</td>
                      <td className="p-2.5 text-slate-500 truncate">
                        {[p.zone, p.locality].filter(Boolean).join(" • ") || "—"}
                      </td>
                      <td className="p-2.5">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 truncate max-w-full">
                          {p.type}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono font-bold text-brand-700 truncate">
                        {p.price ? `${p.price}${p.priceType === "Starting From" ? "+" : ""}` : "—"}
                      </td>
                      <td className="p-2.5">
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-600 truncate">
                          <Users className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{teamLabelForProperty(p)}</span>
                        </span>
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => handleSelectProperty(p)}
                            className="p-1.5 rounded-lg text-brand-600 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                            title="View details"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                          {activeRole === "ADMIN" && (
                            <button
                              onClick={() => handleEditProperty(p)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                              title="Edit property details"
                            >
                              <Edit className="h-3.5 w-3.5" />
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

          {/* Mobile: stacked cards */}
          <div className="md:hidden space-y-3">
            {filteredProperties.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 font-semibold italic border border-dashed border-slate-200 rounded-xl">
                No properties match the current filters.
              </div>
            ) : (
              filteredProperties.map((p) => (
                <div key={p.id} className="border border-slate-200 rounded-xl bg-white shadow-sm p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-500 font-semibold">{p.developer}</p>
                    </div>
                    <span className="inline-block shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {p.type}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400 font-semibold block text-[9px] uppercase">Location</span>
                      <span className="text-slate-700 font-semibold truncate block">
                        {[p.zone, p.locality].filter(Boolean).join(" • ") || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block text-[9px] uppercase">Price</span>
                      <span className="text-brand-700 font-mono font-bold block">
                        {p.price ? `${p.price}${p.priceType === "Starting From" ? "+" : ""}` : "—"}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400 font-semibold block text-[9px] uppercase">Team</span>
                      <span className="inline-flex items-center gap-1 text-slate-700 font-semibold">
                        <Users className="h-3 w-3 text-slate-400" />
                        {teamLabelForProperty(p)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleSelectProperty(p)}
                      className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 transition-colors"
                    >
                      <Info className="h-3.5 w-3.5" /> Details
                    </button>
                    {activeRole === "ADMIN" && (
                      <button
                        onClick={() => handleEditProperty(p)}
                        className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                      >
                        <Edit className="h-3.5 w-3.5" /> Edit
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right side detailed view */}
        <div className="lg:col-span-4">
          {selectedProperty ? (
            <div className="glass-card p-6 rounded-2xl space-y-6 relative overflow-hidden animate-fade-in">
              <div className="absolute top-0 right-0 w-20 h-20 bg-brand-500/5 rounded-full blur-xl" />
              
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-brand-600 uppercase tracking-wider">{selectedProperty.developer}</span>
                  <h3 className="text-lg font-bold text-slate-800 mt-0.5">{selectedProperty.name}</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {selectedProperty.location}
                  </p>
                </div>
                {activeRole === "ADMIN" && (
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-slate-400 hover:text-brand-600 transition-colors p-1"
                    title="Toggle Edit Mode"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                )}
              </div>

              {isEditing && activeRole === "ADMIN" ? (
                // Edit Property Form
                <form onSubmit={handleSavePropertyEdit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Name</label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Developer / Builder</label>
                    <input
                      type="text"
                      required
                      value={editDev}
                      onChange={(e) => setEditDev(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Location</label>
                    <input
                      type="text"
                      required
                      value={editLoc}
                      onChange={(e) => setEditLoc(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Zone</label>
                    <input
                      type="text"
                      value={editZone}
                      onChange={(e) => setEditZone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Price Range</label>
                      <input
                        type="text"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Type</label>
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                      >
                        <option>Apartment</option>
                        <option>Plot</option>
                        <option>Villa</option>
                        <option>Commercial</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Description</label>
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <MetaCampaignLinker propertyId={selectedProperty.id} isAdmin={activeRole === "ADMIN"} />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-brand-700 hover:bg-brand-600 text-white font-bold py-2 rounded-lg text-xs transition-all shadow-sm"
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProperty(selectedProperty.id)}
                      className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-center"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              ) : (
                // Regular Read-only details
                <>
                  {/* Specs */}
                  <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-slate-450 block mb-0.5">Project Status</span>
                      <span className="font-bold text-slate-800">{selectedProperty.propertyStatus || selectedProperty.projectStatus || "Pre-Launch"}</span>
                    </div>
                    <div>
                      <span className="text-slate-450 block mb-0.5">Possession Date</span>
                      <span className="font-bold text-slate-800">{selectedProperty.possessionDate || "30 Dec 2030"}</span>
                    </div>
                    <div>
                      <span className="text-slate-450 block mb-0.5">Zone</span>
                      <span className="font-bold text-slate-800">{selectedProperty.zone || "—"}</span>
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
                        <span className="font-bold text-slate-800">
                          {selectedProperty.leadAssignmentMode === "ROUND_ROBIN" ? "Round Robin" : "Percentage Based"}
                        </span>
                      </div>
                    )}
                    <div className="col-span-2 border-t border-slate-200 pt-2 mt-1">
                      <span className="text-slate-450 block mb-0.5">Price Structure</span>
                      <span className="font-bold text-brand-700 font-mono text-sm">{selectedProperty.price || "Contact for pricing"}</span>
                    </div>
                    {selectedProperty.tags && selectedProperty.tags.length > 0 && (
                      <div className="col-span-2 flex flex-wrap gap-1 pt-1">
                        {selectedProperty.tags.map(tag => (
                          <span key={tag} className="bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-bold">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* About Text */}
                  {selectedProperty.description && (
                    <div className="space-y-1.5 text-xs leading-relaxed">
                      <span className="font-bold text-slate-700 block">About Project</span>
                      <p className="text-slate-600 whitespace-pre-line">{selectedProperty.description}</p>
                    </div>
                  )}

                  {/* Connected Meta Campaigns */}
                  <div className="border-t border-slate-200 pt-4">
                    <MetaCampaignLinker propertyId={selectedProperty.id} isAdmin={activeRole === "ADMIN"} />
                  </div>

                  {/* Register Interest Form */}
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
                      <div>
                        <input
                          type="text"
                          required
                          placeholder="Client Name (ex. Deepak Yadav)"
                          value={interestName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                        />
                      </div>
                      <div>
                        <input
                          type="tel"
                          required
                          placeholder="Phone Number (ex. 9876543210)"
                          value={interestPhone}
                          onChange={(e) => setInterestPhone(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                        />
                      </div>
                      <div>
                        <input
                          type="email"
                          placeholder="Email address (optional)"
                          value={interestEmail}
                          onChange={(e) => setInterestEmail(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2 bg-brand-700 hover:bg-brand-600 text-white font-bold rounded-lg text-xs transition-all shadow-sm"
                      >
                        Register Interest
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="glass-card p-8 rounded-2xl text-center text-xs text-slate-400">
              <Building className="h-10 w-10 text-slate-350 mx-auto mb-2" />
              <span>Select a property from the portfolio list to view specifications, locational zone grids, and register client interest.</span>
            </div>
          )}
        </div>
      </div>

      {/* Add Property Modal */}
      <AddPropertyModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={handlePropertyCreated}
      />
    </div>
  );
}
