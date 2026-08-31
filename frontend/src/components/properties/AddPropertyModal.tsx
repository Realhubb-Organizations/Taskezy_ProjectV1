"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useApp, Property, LeadAssignmentMode, PropertyTeamAssignmentMode, PropertyTeamMember } from "@/context/AppContext";

interface AddPropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
  /** Prefills the form from an existing property (used by the properties table's Duplicate action) — always creates a new property, never edits the source. */
  duplicateFrom?: Property | null;
}

const PROPERTY_TYPES = ["Apartment", "Villa", "Plot", "Commercial", "Residential", "Mixed-Use"];
const PROPERTY_STATUSES = ["Pre-Launch", "Under Construction", "Ready to Move", "Sold Out"];

// Only what the database actually requires (see Taskezy-Server/src/modules/properties/properties.schema.ts) —
// name, developer, propertyType, and location. Everything else here is optional server-side.
const REQUIRED_FIELDS = ["name", "developer", "propertyType", "location"] as const;

export default function AddPropertyModal({ isOpen, onClose, onSuccess, duplicateFrom }: AddPropertyModalProps) {
  const { users, addProperty } = useApp();

  const [activeTab, setActiveTab] = useState<"details" | "team">("details");

  // Property Details — field set and order match the provided design exactly.
  const [developer, setDeveloper] = useState("");
  const [name, setName] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [propertyStatus, setPropertyStatus] = useState("");
  const [possessionDate, setPossessionDate] = useState("");
  const [price, setPrice] = useState("");
  const [leadRegistrationUrl, setLeadRegistrationUrl] = useState("");
  const [description, setDescription] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [location, setLocation] = useState("");
  const [mapUrl, setMapUrl] = useState("");

  // Team Access Settings
  const [teamAssignmentMode, setTeamAssignmentMode] = useState<PropertyTeamAssignmentMode>("ALL_MEMBERS");
  const [leadAssignmentMode, setLeadAssignmentMode] = useState<LeadAssignmentMode>("ROUND_ROBIN");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberPercentages, setMemberPercentages] = useState<Record<string, number>>({});
  const [memberSearch, setMemberSearch] = useState("");

  const salesTeam = users.filter(u => u.department === "SALES" && u.role !== "ADMIN");
  const visibleTeam = salesTeam.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()));

  const resetForm = () => {
    setActiveTab("details");
    setDeveloper("");
    setName("");
    setPropertyType("");
    setPropertyStatus("");
    setPossessionDate("");
    setPrice("");
    setLeadRegistrationUrl("");
    setDescription("");
    setContactNumber("");
    setLocation("");
    setMapUrl("");
    setTeamAssignmentMode("ALL_MEMBERS");
    setLeadAssignmentMode("ROUND_ROBIN");
    setSelectedMemberIds([]);
    setMemberPercentages({});
    setMemberSearch("");
  };

  // Prefill from the source property whenever a duplicate is requested — a
  // fresh copy, not a live edit link back to the original.
  useEffect(() => {
    if (isOpen && duplicateFrom) {
      setDeveloper(duplicateFrom.developer);
      setName(`${duplicateFrom.name} (Copy)`);
      setPropertyType(duplicateFrom.type);
      setPropertyStatus(duplicateFrom.propertyStatus || "");
      setPossessionDate(duplicateFrom.possessionDate || "");
      setPrice(duplicateFrom.price || "");
      setLeadRegistrationUrl(duplicateFrom.leadRegistrationUrl || "");
      setDescription(duplicateFrom.description || "");
      setContactNumber(duplicateFrom.contactNumber || "");
      setLocation(duplicateFrom.location);
      setMapUrl(duplicateFrom.mapUrl || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, duplicateFrom]);

  if (!isOpen) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const toggleMember = (userId: string) => {
    setSelectedMemberIds(prev => (prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]));
  };

  const selectedPercentageTotal = selectedMemberIds.reduce((sum, id) => sum + (memberPercentages[id] || 0), 0);

  const fieldValues: Record<(typeof REQUIRED_FIELDS)[number], string> = { name, developer, propertyType, location };

  const validateDetailsTab = (): boolean => {
    const missing = REQUIRED_FIELDS.filter(f => !fieldValues[f].trim());
    if (missing.length > 0) {
      alert("Please fill in Builder Name, Property Name, Property Type, and Location before continuing.");
      return false;
    }
    return true;
  };

  const handleSaveAndNext = () => {
    if (validateDetailsTab()) setActiveTab("team");
  };

  const handleCreateProperty = () => {
    if (!validateDetailsTab()) {
      setActiveTab("details");
      return;
    }
    if (teamAssignmentMode === "CUSTOM_MEMBERS" && selectedMemberIds.length === 0) {
      alert("Select at least one team member, or switch to All Members.");
      return;
    }
    if (teamAssignmentMode === "CUSTOM_MEMBERS" && leadAssignmentMode === "PERCENTAGE" && selectedPercentageTotal !== 100) {
      if (!confirm(`Selected member percentages add up to ${selectedPercentageTotal}%, not 100%. Save anyway?`)) return;
    }

    const assignedTeam: PropertyTeamMember[] | undefined =
      teamAssignmentMode === "CUSTOM_MEMBERS"
        ? selectedMemberIds.map(id => {
            const member = salesTeam.find(u => u.id === id);
            return {
              userId: id,
              name: member?.name || "Unknown",
              percentage: leadAssignmentMode === "PERCENTAGE" ? memberPercentages[id] || 0 : undefined
            };
          })
        : undefined;

    const propertyData: Omit<Property, "id" | "membersCount"> = {
      name,
      developer,
      location,
      price: price || undefined,
      priceType: "Absolute",
      type: propertyType,
      propertyStatus: propertyStatus || undefined,
      description: description || undefined,
      possessionDate: possessionDate || undefined,
      contactNumber: contactNumber || undefined,
      mapUrl: mapUrl || undefined,
      leadRegistrationUrl: leadRegistrationUrl || undefined,
      teamAssignmentMode,
      leadAssignmentMode: teamAssignmentMode === "CUSTOM_MEMBERS" ? leadAssignmentMode : undefined,
      assignedTeam
    };

    addProperty(propertyData);
    onSuccess(name);
    handleClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30" onClick={handleClose} />
      <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center sm:p-4">
        <div className="w-full sm:max-w-xl h-[95vh] sm:h-auto sm:max-h-[90vh] bg-white border-0 sm:border border-slate-200 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
            <h3 className="text-sm font-bold text-slate-800">Add Property details</h3>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 px-6 border-b border-slate-100 shrink-0">
            <button
              onClick={() => setActiveTab("details")}
              className={`py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === "details" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-450 hover:text-slate-600"
              }`}
            >
              Property Details
            </button>
            <button
              onClick={() => setActiveTab("team")}
              className={`py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === "team" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-450 hover:text-slate-600"
              }`}
            >
              Team Access Settings
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeTab === "details" && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Builder Name</label>
                    <input
                      type="text"
                      value={developer}
                      onChange={(e) => setDeveloper(e.target.value)}
                      placeholder="e.g. developer name"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. property name"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Type</label>
                    <select
                      value={propertyType}
                      onChange={(e) => setPropertyType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-brand-500"
                    >
                      <option value="">Select property type</option>
                      {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Status</label>
                    <select
                      value={propertyStatus}
                      onChange={(e) => setPropertyStatus(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-brand-500"
                    >
                      <option value="">Select property status</option>
                      {PROPERTY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Possession Date</label>
                    <input
                      type="date"
                      value={possessionDate}
                      onChange={(e) => setPossessionDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Quoted Price</label>
                    <input
                      type="text"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="e.g. 1.91 Cr"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Lead Registration URL</label>
                    <input
                      type="text"
                      value={leadRegistrationUrl}
                      onChange={(e) => setLeadRegistrationUrl(e.target.value)}
                      placeholder="e.g. landing page lead form link"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. project description"
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Contact Number</label>
                  <input
                    type="tel"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="e.g. contact number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Location</label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. enter location"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Map URL</label>
                    <input
                      type="text"
                      value={mapUrl}
                      onChange={(e) => setMapUrl(e.target.value)}
                      placeholder="e.g. paste map url"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "team" && (
              <div className="space-y-4 animate-fade-in">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">Select Team Members</span>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={teamAssignmentMode === "ALL_MEMBERS"}
                        onChange={() => setTeamAssignmentMode("ALL_MEMBERS")}
                        className="h-3.5 w-3.5 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-xs font-semibold text-slate-700">All Members</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={teamAssignmentMode === "CUSTOM_MEMBERS"}
                        onChange={() => setTeamAssignmentMode("CUSTOM_MEMBERS")}
                        className="h-3.5 w-3.5 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-xs font-semibold text-slate-700">Custom Members</span>
                    </label>
                  </div>

                  {teamAssignmentMode === "CUSTOM_MEMBERS" && (
                    <div className="space-y-3 pt-3 border-t border-slate-200 animate-fade-in">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Select Distribution</span>
                        <div className="flex items-center gap-6">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              checked={leadAssignmentMode === "ROUND_ROBIN"}
                              onChange={() => setLeadAssignmentMode("ROUND_ROBIN")}
                              className="h-3.5 w-3.5 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="text-xs font-semibold text-slate-700">Round Robin</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              checked={leadAssignmentMode === "PERCENTAGE"}
                              onChange={() => setLeadAssignmentMode("PERCENTAGE")}
                              className="h-3.5 w-3.5 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="text-xs font-semibold text-slate-700">Percentage Split</span>
                          </label>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Looking for your team members?"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                      />

                      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto bg-white">
                        {visibleTeam.length === 0 ? (
                          <p className="text-[10px] text-slate-400 italic p-3">No matching team members.</p>
                        ) : (
                          visibleTeam.map(member => {
                            const isChecked = selectedMemberIds.includes(member.id);
                            return (
                              <div key={member.id} className="flex items-center justify-between p-2.5 hover:bg-slate-50">
                                <label className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleMember(member.id)}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                  />
                                  <span className="text-xs font-semibold text-slate-800 truncate">{member.name}</span>
                                </label>
                                {isChecked && leadAssignmentMode === "PERCENTAGE" && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={memberPercentages[member.id] ?? 0}
                                      onChange={(e) =>
                                        setMemberPercentages(prev => ({ ...prev, [member.id]: Number(e.target.value) }))
                                      }
                                      className="w-14 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] text-right font-mono focus:outline-none"
                                    />
                                    <span className="text-[10px] text-slate-400 font-bold">%</span>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {leadAssignmentMode === "PERCENTAGE" && selectedMemberIds.length > 0 && (
                        <p className={`text-[10px] font-bold ${selectedPercentageTotal === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                          Total: {selectedPercentageTotal}%
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end items-center gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
            <button
              onClick={handleClose}
              className="px-5 py-2 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            {activeTab === "details" ? (
              <button
                onClick={handleSaveAndNext}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-brand-700 hover:bg-brand-600 text-white transition-all shadow-sm"
              >
                Save &amp; Next
              </button>
            ) : (
              <button
                onClick={handleCreateProperty}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-brand-700 hover:bg-brand-600 text-white transition-all shadow-sm"
              >
                Create Property
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
