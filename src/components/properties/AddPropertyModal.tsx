"use client";

import React, { useRef, useState } from "react";
import {
  X,
  Info,
  Users,
  UploadCloud,
  FileText,
  Trash2,
  MapPin,
  Check
} from "lucide-react";
import { useApp, Property, LeadAssignmentMode, PropertyTeamAssignmentMode, PropertyTeamMember } from "@/context/AppContext";

interface AddPropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
}

const PROPERTY_TYPES = ["Residential", "Commercial", "Apartment", "Villa", "Plot", "Mixed-Use"];
const PROPERTY_STATUSES = ["Pre-Launch", "Under Construction", "Ready to Move", "Sold Out"];

export default function AddPropertyModal({ isOpen, onClose, onSuccess }: AddPropertyModalProps) {
  const { properties, users, addProperty } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"basic" | "team">("basic");

  // Basic Information fields
  const [name, setName] = useState("");
  const [developer, setDeveloper] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [propertyStatus, setPropertyStatus] = useState("");
  const [possessionDate, setPossessionDate] = useState("");
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState<"Absolute" | "Starting From">("Absolute");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [leadRegistrationUrl, setLeadRegistrationUrl] = useState("");
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Contact & Location
  const [contactNumber, setContactNumber] = useState("");
  const [zone, setZone] = useState("");
  const [locality, setLocality] = useState("");
  const [mapUrl, setMapUrl] = useState("");

  // Media & Documents (filenames only — no real upload backend)
  const [mediaFileNames, setMediaFileNames] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Team Members Assignment
  const [teamAssignmentMode, setTeamAssignmentMode] = useState<PropertyTeamAssignmentMode>("ALL_MEMBERS");
  const [leadAssignmentMode, setLeadAssignmentMode] = useState<LeadAssignmentMode>("ROUND_ROBIN");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberPercentages, setMemberPercentages] = useState<Record<string, number>>({});

  const zoneOptions = Array.from(new Set(properties.map(p => p.zone).filter(Boolean))) as string[];
  const localityOptions = Array.from(new Set(properties.map(p => p.locality).filter(Boolean))) as string[];
  const salesTeam = users.filter(u => u.department === "SALES" && u.role !== "ADMIN");

  if (!isOpen) return null;

  const resetForm = () => {
    setActiveTab("basic");
    setName("");
    setDeveloper("");
    setPropertyType("");
    setPropertyStatus("");
    setPossessionDate("");
    setPrice("");
    setPriceType("Absolute");
    setWebsiteUrl("");
    setLeadRegistrationUrl("");
    setDescription("");
    setTagInput("");
    setTags([]);
    setContactNumber("");
    setZone("");
    setLocality("");
    setMapUrl("");
    setMediaFileNames([]);
    setTeamAssignmentMode("ALL_MEMBERS");
    setLeadAssignmentMode("ROUND_ROBIN");
    setSelectedMemberIds([]);
    setMemberPercentages({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleAddTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput("");
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleFilesAdded = (fileList: FileList | null) => {
    if (!fileList) return;
    const names = Array.from(fileList).map(f => f.name);
    setMediaFileNames(prev => [...prev, ...names]);
  };

  const toggleMember = (userId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const selectedPercentageTotal = selectedMemberIds.reduce((sum, id) => sum + (memberPercentages[id] || 0), 0);

  const validateBasicTab = (): boolean => {
    if (!name || !developer || !propertyType || !propertyStatus || !websiteUrl || !leadRegistrationUrl || !description || !contactNumber || !zone || !locality || !mapUrl) {
      alert("Please fill in all required fields (marked *) before continuing.");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (validateBasicTab()) setActiveTab("team");
  };

  const handleSaveProperty = () => {
    if (!validateBasicTab()) {
      setActiveTab("basic");
      return;
    }

    if (teamAssignmentMode === "CUSTOM_MEMBERS" && selectedMemberIds.length === 0) {
      alert("Select at least one team member, or switch to All Members.");
      return;
    }

    if (teamAssignmentMode === "CUSTOM_MEMBERS" && leadAssignmentMode === "PERCENTAGE" && selectedPercentageTotal !== 100) {
      if (!confirm(`Selected member percentages add up to ${selectedPercentageTotal}%, not 100%. Save anyway?`)) {
        return;
      }
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
      location: `${locality}, ${zone}`,
      locality,
      zone,
      price: price || undefined,
      priceType,
      type: propertyType,
      propertyStatus,
      description,
      possessionDate: possessionDate || undefined,
      contactNumber,
      mapUrl,
      websiteUrl,
      leadRegistrationUrl,
      tags,
      mediaFileNames,
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
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] bg-white border border-slate-200 rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-brand-700">New Property</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Create a new property by filling in the details below.</p>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-655">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-6 py-3 border-b border-slate-100 shrink-0">
          <button
            onClick={() => setActiveTab("basic")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "basic" ? "bg-brand-700 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            <Info className="h-3.5 w-3.5" />
            Basic Information
          </button>
          <button
            onClick={() => setActiveTab("team")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "team" ? "bg-brand-700 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Team Members
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {activeTab === "basic" && (
            <div className="space-y-6 animate-fade-in">
              {/* Basic Information */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-slate-500" /> Basic Information
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Name *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter property name"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Builder or Company Name *</label>
                    <input
                      type="text"
                      required
                      value={developer}
                      onChange={(e) => setDeveloper(e.target.value)}
                      placeholder="Enter builder or company name"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Type *</label>
                    <select
                      required
                      value={propertyType}
                      onChange={(e) => setPropertyType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-brand-500"
                    >
                      <option value="">Select property type</option>
                      {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Status *</label>
                    <select
                      required
                      value={propertyStatus}
                      onChange={(e) => setPropertyStatus(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-brand-500"
                    >
                      <option value="">Select property status</option>
                      {PROPERTY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Possession Date</label>
                    <input
                      type="date"
                      value={possessionDate}
                      onChange={(e) => setPossessionDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Price (Optional)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="Value"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                      />
                      <select
                        value={priceType}
                        onChange={(e) => setPriceType(e.target.value as "Absolute" | "Starting From")}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-700 focus:outline-none focus:border-brand-500 shrink-0"
                      >
                        <option value="Absolute">Absolute</option>
                        <option value="Starting From">Starting From</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Website URL *</label>
                  <input
                    type="url"
                    required
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="Enter website URL"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Lead Registration URL *</label>
                  <input
                    type="url"
                    required
                    value={leadRegistrationUrl}
                    onChange={(e) => setLeadRegistrationUrl(e.target.value)}
                    placeholder="Enter lead registration form URL"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Description *</label>
                  <textarea
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter property description..."
                    rows={4}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Tags</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder="Add a tag and press Enter"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="shrink-0 bg-brand-700 hover:bg-brand-600 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all"
                    >
                      Add
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tags.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 bg-brand-50 border border-brand-100 text-brand-700 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                          {tag}
                          <button type="button" onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="hover:text-brand-900">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Contact & Location */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-500" /> Contact &amp; Location
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Contact Number *</label>
                    <input
                      type="tel"
                      required
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      placeholder="Enter contact number"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Zone *</label>
                    <input
                      list="zone-options"
                      required
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                      placeholder="Enter or select zone"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                    />
                    <datalist id="zone-options">
                      {zoneOptions.map(z => <option key={z} value={z} />)}
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Locality *</label>
                  <input
                    list="locality-options"
                    required
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    placeholder="Enter or select locality"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                  />
                  <datalist id="locality-options">
                    {localityOptions.map(l => <option key={l} value={l} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Map URL *</label>
                  <input
                    type="url"
                    required
                    value={mapUrl}
                    onChange={(e) => setMapUrl(e.target.value)}
                    placeholder="Enter Google Maps URL or location link"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Media & Documents */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-slate-500" /> Media &amp; Documents
                  </span>
                  <span className="text-slate-400 normal-case font-bold">{mediaFileNames.length} files added</span>
                </h4>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    handleFilesAdded(e.dataTransfer.files);
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    isDragOver ? "border-brand-400 bg-brand-50/40" : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                  }`}
                >
                  <UploadCloud className="h-6 w-6 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">Drop files here or click to browse</p>
                  <p className="text-[10px] text-slate-400 mt-1">Images, Videos, PDF, and Documents • Max 25MB per file</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFilesAdded(e.target.files)}
                  />
                </div>

                {mediaFileNames.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic text-center py-2">
                    No media or documents uploaded. Add images, videos, or documents to showcase this property.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {mediaFileNames.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px]">
                        <span className="text-slate-700 font-semibold truncate">{f}</span>
                        <button
                          type="button"
                          onClick={() => setMediaFileNames(prev => prev.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-red-600 shrink-0 ml-2"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "team" && (
            <div className="space-y-5 animate-fade-in">
              <h4 className="text-xs font-bold text-slate-700">Team Members Assignment</h4>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setTeamAssignmentMode("ALL_MEMBERS")}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3 ${
                    teamAssignmentMode === "ALL_MEMBERS" ? "border-brand-400 bg-brand-50/40" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className={`h-4 w-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                    teamAssignmentMode === "ALL_MEMBERS" ? "border-brand-600" : "border-slate-300"
                  }`}>
                    {teamAssignmentMode === "ALL_MEMBERS" && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                  </span>
                  <span>
                    <span className="block text-xs font-bold text-slate-800">All Members</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">All current and future team members will be part of this property.</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTeamAssignmentMode("CUSTOM_MEMBERS")}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3 ${
                    teamAssignmentMode === "CUSTOM_MEMBERS" ? "border-brand-400 bg-brand-50/40" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className={`h-4 w-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                    teamAssignmentMode === "CUSTOM_MEMBERS" ? "border-brand-600" : "border-slate-300"
                  }`}>
                    {teamAssignmentMode === "CUSTOM_MEMBERS" && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                  </span>
                  <span>
                    <span className="block text-xs font-bold text-slate-800">Custom Members</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">Pick specific sales agents, managers, or team leads for this property.</span>
                  </span>
                </button>
              </div>

              {teamAssignmentMode === "CUSTOM_MEMBERS" && (
                <div className="space-y-4 pt-2 border-t border-slate-100 animate-fade-in">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase">Lead Assignment Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setLeadAssignmentMode("ROUND_ROBIN")}
                        className={`p-2.5 rounded-lg text-[11px] font-bold border transition-all ${
                          leadAssignmentMode === "ROUND_ROBIN" ? "bg-brand-50 border-brand-300 text-brand-700" : "bg-white border-slate-200 text-slate-500"
                        }`}
                      >
                        Round Robin
                      </button>
                      <button
                        type="button"
                        onClick={() => setLeadAssignmentMode("PERCENTAGE")}
                        className={`p-2.5 rounded-lg text-[11px] font-bold border transition-all ${
                          leadAssignmentMode === "PERCENTAGE" ? "bg-brand-50 border-brand-300 text-brand-700" : "bg-white border-slate-200 text-slate-500"
                        }`}
                      >
                        Percentage Based
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      {leadAssignmentMode === "ROUND_ROBIN"
                        ? "Incoming leads for this property are distributed evenly, one after another, across the selected members."
                        : "Incoming leads are distributed according to the percentage weight assigned to each selected member."}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Select Sales Team</label>
                      {leadAssignmentMode === "PERCENTAGE" && (
                        <span className={`text-[10px] font-bold ${selectedPercentageTotal === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                          Total: {selectedPercentageTotal}%
                        </span>
                      )}
                    </div>
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                      {salesTeam.map(member => {
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
                              <span className="min-w-0">
                                <span className="block text-xs font-bold text-slate-800 truncate">{member.name}</span>
                                <span className="block text-[9px] text-slate-450">
                                  {member.role_type === "Manager" ? "Sales Manager / TL" : "Sales Agent"}
                                </span>
                              </span>
                            </label>
                            {isChecked && leadAssignmentMode === "PERCENTAGE" && (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={memberPercentages[member.id] ?? 0}
                                onChange={(e) =>
                                  setMemberPercentages(prev => ({ ...prev, [member.id]: Number(e.target.value) }))
                                }
                                className="w-16 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] text-right font-mono focus:outline-none"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all"
          >
            Cancel
          </button>
          {activeTab === "basic" ? (
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 bg-brand-700 hover:bg-brand-600 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-sm"
            >
              Next: Team Members
            </button>
          ) : (
            <button
              onClick={handleSaveProperty}
              className="inline-flex items-center gap-1.5 bg-brand-700 hover:bg-brand-600 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-sm"
            >
              <Check className="h-3.5 w-3.5" />
              Save Property
            </button>
          )}
        </div>
      </div>
    </>
  );
}
