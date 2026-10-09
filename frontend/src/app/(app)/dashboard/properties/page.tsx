"use client";

import React, { useEffect, useState } from "react";
import { useApp, mapApiPropertyToFrontend, Property, PropertyTeamAssignmentMode, LeadAssignmentMode, PropertyTeamMember } from "@/context/AppContext";
import { apiListPropertiesPage, type PropertyListFilters } from "@/lib/apiClient";
import {
  Search,
  ArrowUp,
  Building,
  Plus,
  Eye,
  MessageCircle,
  Edit,
  Copy,
  Trash2,
  Download,
  X,
  MapPin,
  Users,
  Info
} from "lucide-react";
import AddPropertyModal, {
  splitPropertyTypes,
  joinPropertyTypes,
  propertyTypeOptions,
  PROPERTY_STATUSES
} from "@/components/properties/AddPropertyModal";
import MetaCampaignLinker from "@/components/properties/MetaCampaignLinker";
import GoogleCampaignLinker from "@/components/properties/GoogleCampaignLinker";
import SheetSourceLinker from "@/components/properties/SheetSourceLinker";
import { useDialog } from "@/components/ui/DialogProvider";
import { MetaIcon, GoogleIcon, platformFromText } from "@/components/icons/ContactIcons";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import TablePagination from "@/components/ui/TablePagination";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/SearchableDropdown";
import { DatePicker } from "@/components/ui/DateRangePicker";
import { DateTimeLines, dateTimeParts } from "@/components/ui/DateTimeLines";

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100];

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function PropertiesPage() {
  const { toast, confirm: confirmDialog } = useDialog();
  const { properties, users, leads, deleteProperty, editProperty, activeRole, currentUser } = useApp();
  const isAdmin = activeRole === "ADMIN";

  // Drawer (view/edit) state
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Search / filter / sort / pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
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

  const types = Array.from(new Set(properties.flatMap(p => splitPropertyTypes(p.type || ""))));

  // Admin's label is exactly what it always was (real total, or "All
  // Members" for the implicit-whole-roster mode) — untouched. A Manager
  // instead sees only how many of THEIR OWN direct reports are on the
  // property's team (blank if none of them are); a sales agent sees only
  // whether THEY themselves are on it ("Assigned" or blank) — never a
  // headcount or teammates' names. See project_crm_role_based_lead_scoping
  // memory for the matching convention this follows (scope by viewer role,
  // Admin path never touched).
  const teamLabelForProperty = (p: Property): string => {
    if (isAdmin) {
      if (p.teamAssignmentMode === "CUSTOM_MEMBERS" && p.assignedTeam && p.assignedTeam.length > 0) {
        return p.assignedTeam.length === 1 ? p.assignedTeam[0].name : `${p.assignedTeam.length} Members`;
      }
      return "All Members";
    }

    // ALL_MEMBERS mode has no explicit assignedTeam list — it means every
    // sales-team member implicitly has the property, so expand it to the
    // real roster before scoping rather than treating it as a separate case.
    const assigned: { userId: string; name: string }[] =
      p.teamAssignmentMode === "CUSTOM_MEMBERS" && p.assignedTeam && p.assignedTeam.length > 0
        ? p.assignedTeam
        : salesTeam.map(u => ({ userId: u.id, name: u.name }));

    if (currentUser?.role_type === "Manager") {
      const myTeamIds = new Set(users.filter(u => u.managerId === currentUser.id).map(u => u.id));
      const mine = assigned.filter(m => myTeamIds.has(m.userId));
      if (mine.length === 0) return "";
      return mine.length === 1 ? mine[0].name : `${mine.length} Members`;
    }

    return currentUser && assigned.some(m => m.userId === currentUser.id) ? "Assigned" : "";
  };

  // Which ad platform(s) are actually generating leads for this property —
  // read straight from the real leads tied to it (matched by property name,
  // the same field every lead-to-property association in this app already
  // uses), not from the separate Meta/Google campaign-linker config, which
  // only tracks ad spend attribution and isn't necessarily where every lead
  // came from.
  const propertySourcePlatforms = (propertyName: string): ("Meta" | "Google")[] => {
    const platforms = new Set<"Meta" | "Google">();
    leads
      .filter(l => l.property === propertyName)
      .forEach(l => {
        const platform = platformFromText(l.source || l.campaign);
        // Deliberately ad-platform-only here — Data Calling's Excel-sourced
        // leads aren't a campaign, so they don't belong in this badge set.
        if (platform === "Meta" || platform === "Google") platforms.add(platform);
      });
    return Array.from(platforms);
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
      toast("No contact number is set for this property yet.", "warning");
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

  // ---- Server-paginated Properties admin table (real fetch-per-page,
  // not the old "read the full `properties` array AppContext bulk-loads"
  // pattern) ----
  // The table's own rows are fetched directly from the server for exactly
  // the current page/filters, instead of slicing the full `properties`
  // array AppContext still bulk-loads for other consumers (AddLeadModal's
  // property picker, LeadDashboard's property filter, AddPropertyModal,
  // and the Property Type filter options below, which stay derived from
  // that full array since it's small/inventory-bounded) — that full load
  // stays for those, this just stops the admin Properties LIST specifically
  // from needing it for its own table.
  const [serverProperties, setServerProperties] = useState<Property[]>([]);
  const [serverTotalCount, setServerTotalCount] = useState(0);
  const [serverPropertiesLoading, setServerPropertiesLoading] = useState(true);
  const [propertiesRefreshNonce, setPropertiesRefreshNonce] = useState(0);

  // Search fires on every keystroke locally but is debounced before it
  // becomes a real network request — same convention as LeadDashboard's
  // debouncedAdminSearch.
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const propertyListFilters: PropertyListFilters = {
    search: debouncedSearchQuery || undefined,
    propertyType: selectedTypes.length > 0 ? selectedTypes : undefined,
    sortDir
  };
  const propertyFiltersKey = JSON.stringify(propertyListFilters);

  useEffect(() => {
    let cancelled = false;
    setServerPropertiesLoading(true);
    apiListPropertiesPage(currentPage, rowsPerPage, propertyListFilters)
      .then((result) => {
        if (cancelled) return;
        setServerProperties(result.rows.map(mapApiPropertyToFrontend));
        setServerTotalCount(result.totalCount);
      })
      .catch((err) => {
        if (!cancelled) console.error("Could not load the properties list page:", err);
      })
      .finally(() => {
        if (!cancelled) setServerPropertiesLoading(false);
      });
    return () => { cancelled = true; };
    // propertyFiltersKey captures every filter input in one stable string so
    // this effect re-fires exactly when a real filter value changes, without
    // needing every individual filter piece listed separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, propertyFiltersKey, propertiesRefreshNonce]);

  const totalRows = serverTotalCount;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const clampedPage = Math.min(currentPage, totalPages);
  // serverProperties already *is* the current page — no slicing needed.
  const pageRows = serverProperties;

  const handleRegisterInterest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!interestName || !interestPhone) {
      toast("Name and phone number are required.", "warning");
      return;
    }
    setInterestSuccess("Thank you! Your interest has been successfully registered. An agent will contact you shortly.");
    setInterestName("");
    setInterestPhone("");
    setInterestEmail("");
    setTimeout(() => setInterestSuccess(""), 5000);
  };

  // Table rows now come from their own server fetch (serverProperties), not
  // the context's `properties` array directly — editProperty/deleteProperty
  // persist to the database fire-and-forget (see AppContext.tsx), so bumping
  // this nonce (on a short delay, giving that write time to land) re-fires
  // the fetch effect to pick up the change, same idea as LeadDashboard's
  // refetch-on-mutation handling.
  const refreshPropertiesTable = () => {
    setTimeout(() => setPropertiesRefreshNonce(n => n + 1), 500);
  };

  const handlePropertyCreated = (name: string) => {
    setDuplicateSource(null);
    setSuccessMsg(`Successfully created property: ${name}`);
    setTimeout(() => setSuccessMsg(""), 4000);
    refreshPropertiesTable();
  };

  const handleSavePropertyEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty) return;

    // Property type is required server-side; the multi-select can be emptied.
    if (!editType.trim()) {
      toast("Select at least one property type.", "warning");
      return;
    }

    if (editTeamAssignmentMode === "CUSTOM_MEMBERS" && editSelectedMemberIds.length === 0) {
      toast("Select at least one team member, or switch to All Members.", "warning");
      return;
    }
    if (editTeamAssignmentMode === "CUSTOM_MEMBERS" && editLeadAssignmentMode === "PERCENTAGE" && editPercentageTotal !== 100) {
      if (!(await confirmDialog({
        title: "Save anyway?",
        message: `Selected member percentages add up to ${editPercentageTotal}%, not 100%.`,
        confirmLabel: "Save anyway"
      }))) return;
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
    refreshPropertiesTable();
  };

  const handleDeleteProperty = async (p: Property) => {
    if (await confirmDialog({
      title: "Delete property?",
      message: `Are you sure you want to delete "${p.name}"?`,
      confirmLabel: "Delete",
      danger: true
    })) {
      deleteProperty(p.id);
      setSuccessMsg("Property deleted successfully.");
      if (selectedProperty?.id === p.id) closeDrawer();
      setTimeout(() => setSuccessMsg(""), 4000);
      refreshPropertiesTable();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => { setDuplicateSource(null); setIsAddOpen(true); }}
            className="inline-flex items-center justify-center gap-2 h-9 px-3.5 bg-[#0B1E6E] hover:bg-[#081650] text-white rounded-xl text-xs font-bold transition-all shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add Property
          </button>
        </div>
      )}

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
          {/* Fixed layout: Actions sized to its icon buttons, every other
              column shares the remaining width equally. */}
          <table className={`table-fixed w-full border-collapse text-xs ${isAdmin ? "min-w-[1270px]" : "min-w-[1150px]"}`}>
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              {/* Campaigns column — Admin-only, see below */}
              {isAdmin && <col />}
              <col className={isAdmin ? "w-[220px]" : "w-[100px]"} />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Properties</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Property Location</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">
                  <SearchableMultiSelect
                    variant="inline"
                    label="Property Type"
                    options={types}
                    selected={selectedTypes}
                    onChange={(next) => { setSelectedTypes(next); setCurrentPage(1); }}
                    searchPlaceholder="Search types..."
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Price</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">
                  <button
                    onClick={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))}
                    className="flex items-center gap-1 hover:text-slate-700"
                  >
                    Date <ArrowUp className={`h-3 w-3 transition-transform duration-300 ease-out ${sortDir === "asc" ? "rotate-180" : ""}`} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Assigned To</th>
                {/* Ad-campaign source attribution is an Admin-only concern (same
                    reasoning as the campaign linkers in the detail drawer) —
                    hidden entirely for Manager/Member, not just emptied out.
                    See project_crm_role_based_lead_scoping memory. */}
                {isAdmin && <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Campaigns</th>}
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {serverPropertiesLoading && pageRows.length === 0 ? (
                <TableRowsSkeleton rows={6} columns={isAdmin ? 8 : 7} />
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="p-8 text-center text-slate-400 font-semibold italic">
                    No properties match the current filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <button onClick={() => openDrawer(p, false)} className="text-left group [overflow-wrap:anywhere]">
                        <span className="block font-bold text-slate-800 group-hover:text-brand-700 transition-colors">{p.developer}</span>
                        <span className="block text-[11px] text-slate-450">{p.name}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600"><div className="[overflow-wrap:anywhere]">{p.location || "—"}</div></td>
                    <td className="px-4 py-3 align-top text-slate-600"><div className="[overflow-wrap:anywhere]">{p.type}</div></td>
                    <td className="px-4 py-3 align-top font-semibold text-slate-800 whitespace-nowrap">{p.price ? `${p.price}*` : "—"}</td>
                    <td className="px-4 py-3 align-top text-slate-500"><DateTimeLines {...dateTimeParts(p.createdAt)} /></td>
                    <td className="px-4 py-3 align-top text-slate-600"><div className="[overflow-wrap:anywhere]">{teamLabelForProperty(p)}</div></td>
                    {isAdmin && (
                      <td className="px-4 py-3 align-top">
                        {(() => {
                          const platforms = propertySourcePlatforms(p.name);
                          if (platforms.length === 0) return <span className="text-slate-400">—</span>;
                          return (
                            <div className="flex items-center gap-1.5" title={platforms.join(" & ")}>
                              {platforms.includes("Meta") && <MetaIcon className="h-4 w-4" />}
                              {platforms.includes("Google") && <GoogleIcon className="h-4 w-4" />}
                            </div>
                          );
                        })()}
                      </td>
                    )}
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <button onClick={() => openDrawer(p, false)} className="inline-flex items-center justify-center h-10 w-10 sm:h-7 sm:w-7 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="View details">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleContactProperty(p)} className="inline-flex items-center justify-center h-10 w-10 sm:h-7 sm:w-7 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="Contact">
                          <MessageCircle className="h-3.5 w-3.5" />
                        </button>
                        {isAdmin && (
                          <button onClick={() => openDrawer(p, true)} className="inline-flex items-center justify-center h-10 w-10 sm:h-7 sm:w-7 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="Edit">
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDuplicateProperty(p)} className="inline-flex items-center justify-center h-10 w-10 sm:h-7 sm:w-7 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="Duplicate">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDeleteProperty(p)} className="inline-flex items-center justify-center h-10 w-10 sm:h-7 sm:w-7 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDownloadProperty(p)} className="inline-flex items-center justify-center h-10 w-10 sm:h-7 sm:w-7 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="Download">
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
        <TablePagination
          totalRows={totalRows}
          page={clampedPage}
          rowsPerPage={rowsPerPage}
          onPageChange={setCurrentPage}
          onRowsPerPageChange={setRowsPerPage}
          rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          rowLabel="Property"
        />
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
                      <SearchableMultiSelect
                        variant="field"
                        options={propertyTypeOptions(editType)}
                        selected={splitPropertyTypes(editType)}
                        onChange={(next) => setEditType(joinPropertyTypes(next))}
                        placeholder="Select property type(s)"
                        searchPlaceholder="Search property types..."
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Status</label>
                      <SearchableSelect
                        options={PROPERTY_STATUSES}
                        value={editStatus}
                        onChange={setEditStatus}
                        placeholder="Select status"
                        searchPlaceholder="Search status..."
                        clearable
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Possession Date</label>
                      <DatePicker value={editPossessionDate} onChange={setEditPossessionDate} />
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
                                      <span className="block text-[11px] font-bold text-slate-800 [overflow-wrap:anywhere]">{member.name}</span>
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
                    <button type="submit" className="flex-1 bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold px-5 py-2 rounded-xl text-sm transition-all shadow-sm">
                      Save Changes
                    </button>
                    <button type="button" onClick={() => handleDeleteProperty(selectedProperty)} className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-5 py-2 rounded-xl text-sm transition-all flex items-center justify-center">
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
                        {teamLabelForProperty(selectedProperty) && <Users className="h-3 w-3 text-slate-400" />}
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

                  {/* Ad-source connection management is an Admin-only concern (API
                      credentials, platform account linking) — hidden entirely for
                      Manager/Member, not just made read-only, per the 2026-10-09
                      instruction. See project_crm_role_based_lead_scoping memory. */}
                  {isAdmin && (
                    <>
                      <div className="border-t border-slate-200 pt-4">
                        <MetaCampaignLinker propertyId={selectedProperty.id} isAdmin={isAdmin} />
                      </div>
                      <div className="border-t border-slate-200 pt-4">
                        <GoogleCampaignLinker propertyId={selectedProperty.id} isAdmin={isAdmin} />
                      </div>
                      <div className="border-t border-slate-200 pt-4">
                        <SheetSourceLinker propertyId={selectedProperty.id} isAdmin={isAdmin} />
                      </div>
                    </>
                  )}

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
                      <button type="submit" className="w-full px-5 py-2 bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold rounded-xl text-sm transition-all shadow-sm">
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
