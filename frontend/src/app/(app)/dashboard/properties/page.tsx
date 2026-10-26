"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp, mapApiPropertyToFrontend, Property, PropertyTeamAssignmentMode, LeadAssignmentMode, PropertyTeamMember } from "@/context/AppContext";
import { apiListPropertiesPage, type PropertyListFilters } from "@/lib/apiClient";
import {
  Search,
  ArrowUp,
  Building,
  Plus,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  Download,
  X,
  Users,
  Info,
  AlertTriangle
} from "lucide-react";
import AddPropertyModal, {
  splitPropertyTypes,
  joinPropertyTypes,
  propertyTypeOptions,
  PROPERTY_STATUSES,
  validatePropertyDetails
} from "@/components/properties/AddPropertyModal";
import MetaCampaignLinker from "@/components/properties/MetaCampaignLinker";
import GoogleCampaignLinker from "@/components/properties/GoogleCampaignLinker";
import SheetSourceLinker from "@/components/properties/SheetSourceLinker";
import type { LinkerHandle } from "@/components/properties/linkerHandle";
import { useDialog } from "@/components/ui/DialogProvider";
import FieldError, { fieldErrorClass } from "@/components/ui/FieldError";
import { collectErrors, normalizeIndianMobile, phoneInputProps, sanitizePhoneInput, validateEmail, validatePersonName, validatePhone } from "@/lib/validation";
import { MetaIcon, GoogleIcon, platformFromText } from "@/components/icons/ContactIcons";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import TablePagination from "@/components/ui/TablePagination";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/SearchableDropdown";
import { DatePicker } from "@/components/ui/DateRangePicker";
import { DateTimeLines, dateTimeParts } from "@/components/ui/DateTimeLines";
import { downloadPropertyBrochure, possessionLabel, priceLabel, propertyBrochureFile, propertyShareText } from "@/lib/propertyBrochurePdf";
import { WhatsAppIcon } from "@/components/icons/ContactIcons";

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100];

// Square icon button with a small label shown on hover / keyboard focus.
function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <span className="relative group">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full mt-1.5 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 z-10"
      >
        {label}
      </span>
    </span>
  );
}

export default function PropertiesPage() {
  const { toast, confirm: confirmDialog } = useDialog();
  const { properties, users, leads, deleteProperty, editProperty, activeRole, currentUser, addLead, manualRefreshSignal } = useApp();
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
  const [interestErrors, setInterestErrors] = useState<Partial<Record<"name" | "phone" | "email", string>>>({});

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
  // Inline messages under the Edit drawer's fields (same rules as Add Property).
  const [editErrors, setEditErrors] = useState<Partial<Record<string, string>>>({});
  const clearEditError = (field: string) => setEditErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev));
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
  // A Manager's own direct reports who are on this property's team — the
  // names behind the "N Members" count. Only meaningful for the Manager
  // role (empty for Admin/sales agent, who use teamLabelForProperty's other
  // branches instead).
  const myTeamMembersOnProperty = (p: Property): { userId: string; name: string }[] => {
    if (currentUser?.role_type !== "Manager") return [];
    // ALL_MEMBERS mode has no explicit assignedTeam list — it means every
    // sales-team member implicitly has the property, so expand it to the
    // real roster before scoping rather than treating it as a separate case.
    const assigned: { userId: string; name: string }[] =
      p.teamAssignmentMode === "CUSTOM_MEMBERS" && p.assignedTeam && p.assignedTeam.length > 0
        ? p.assignedTeam
        : salesTeam.map(u => ({ userId: u.id, name: u.name }));
    const myTeamIds = new Set(users.filter(u => u.managerId === currentUser.id).map(u => u.id));
    return assigned.filter(m => myTeamIds.has(m.userId));
  };

  // The names behind a clickable "N Members" / "All Members" label: Admin
  // sees the property's whole team (every sales member for "All Members"),
  // a Manager only their own direct reports on it; agents get no names.
  const teamMembersToList = (p: Property): { userId: string; name: string }[] => {
    if (isAdmin) {
      return p.teamAssignmentMode === "CUSTOM_MEMBERS" && p.assignedTeam && p.assignedTeam.length > 0
        ? p.assignedTeam
        : salesTeam.map(u => ({ userId: u.id, name: u.name }));
    }
    return myTeamMembersOnProperty(p);
  };

  const teamLabelForProperty = (p: Property): string => {
    if (isAdmin) {
      if (p.teamAssignmentMode === "CUSTOM_MEMBERS" && p.assignedTeam && p.assignedTeam.length > 0) {
        return p.assignedTeam.length === 1 ? p.assignedTeam[0].name : `${p.assignedTeam.length} Members`;
      }
      return "All Members";
    }

    if (currentUser?.role_type === "Manager") {
      const mine = myTeamMembersOnProperty(p);
      if (mine.length === 0) return "";
      return mine.length === 1 ? mine[0].name : `${mine.length} Members`;
    }

    const assigned: { userId: string; name: string }[] =
      p.teamAssignmentMode === "CUSTOM_MEMBERS" && p.assignedTeam && p.assignedTeam.length > 0
        ? p.assignedTeam
        : salesTeam.map(u => ({ userId: u.id, name: u.name }));
    return currentUser && assigned.some(m => m.userId === currentUser.id) ? "Assigned" : "";
  };

  // Manager clicks their own "N Members" count to expand it, in place,
  // into the names it's counting — never a popup, just a small list right
  // under the count itself. Admin and sales-agent views never read this
  // (sales agent's label is never a count — just "Assigned" or blank — so
  // there's nothing to expand). Only ever the manager's OWN direct reports,
  // never the full property team. See project_crm_role_based_lead_scoping
  // memory (2026-10-10).
  const [expandedTeamPropertyId, setExpandedTeamPropertyId] = useState<string | null>(null);
  const toggleMyTeamOnProperty = (p: Property) => setExpandedTeamPropertyId(id => (id === p.id ? null : p.id));

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
    setEditErrors({});
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
    setExpandedTeamPropertyId(null); // names list starts collapsed each time
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => {
      setSelectedProperty(null);
      setIsEditing(false);
      setLinkerDirty({ meta: false, google: false, sheet: false });
    }, 200);
  };

  // Connected campaigns / sheet sources stage their changes; the popup's
  // Save button (and the Edit form's save) persists all the changed ones.
  const metaLinkerRef = useRef<LinkerHandle>(null);
  const googleLinkerRef = useRef<LinkerHandle>(null);
  const sheetLinkerRef = useRef<LinkerHandle>(null);
  const [linkerDirty, setLinkerDirty] = useState({ meta: false, google: false, sheet: false });
  const [savingLinkers, setSavingLinkers] = useState(false);
  const popupDirty = linkerDirty.meta || linkerDirty.google || linkerDirty.sheet;
  const onMetaDirty = useCallback((d: boolean) => setLinkerDirty(x => (x.meta === d ? x : { ...x, meta: d })), []);
  const onGoogleDirty = useCallback((d: boolean) => setLinkerDirty(x => (x.google === d ? x : { ...x, google: d })), []);
  const onSheetDirty = useCallback((d: boolean) => setLinkerDirty(x => (x.sheet === d ? x : { ...x, sheet: d })), []);
  const saveLinkers = async (): Promise<boolean> => {
    setSavingLinkers(true);
    const results = await Promise.all([metaLinkerRef, googleLinkerRef, sheetLinkerRef].map(r => r.current?.save() ?? Promise.resolve(true)));
    setSavingLinkers(false);
    return results.every(Boolean);
  };

  const handleSavePopup = async () => {
    if (await saveLinkers()) toast("Changes saved.", "success");
    else toast("Some changes couldn't be saved. Please check and try again.", "error");
  };

  // X / outside click: don't silently drop unsaved changes.
  const requestCloseDrawer = async () => {
    if (popupDirty && !(await confirmDialog({
      title: "Discard unsaved changes?",
      message: "You've changed connected campaigns or sheets but haven't saved them.",
      confirmLabel: "Discard"
    }))) return;
    closeDrawer();
  };

  // Phones: the share sheet with the brochure PDF + message (pick WhatsApp,
  // then the chat). Laptops: WhatsApp Web can't take a file, so it opens
  // with the formatted message and the user picks the chat.
  const handleShareProperty = async (p: Property) => {
    const text = propertyShareText(p);
    const isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent);
    try {
      if (isPhone && typeof navigator.share === "function") {
        const file = await propertyBrochureFile(p);
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text });
          return;
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // closed the share sheet
      console.error("Sharing the brochure failed:", err);
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  // Row "⋯" menu — portaled and fixed-positioned so the table's overflow
  // can't clip it. Closes on outside click, Escape, scroll or resize.
  const [rowMenu, setRowMenu] = useState<{ property: Property; top: number; right: number } | null>(null);
  useEffect(() => {
    if (!rowMenu) return;
    const close = () => setRowMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [rowMenu]);

  // Same text as the WhatsApp share, ready to paste anywhere.
  const handleCopyPropertyText = async (p: Property) => {
    try {
      await navigator.clipboard.writeText(propertyShareText(p));
      toast("Copied", "success");
    } catch {
      toast("Couldn't copy. Please try again.", "error");
    }
  };

  const handleDownloadProperty = async (p: Property) => {
    try {
      await downloadPropertyBrochure(p);
    } catch (err) {
      console.error("Brochure PDF failed:", err);
      toast("Couldn't create the brochure PDF. Please try again.", "error");
    }
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
  // Distinct from "0 rows" — a failed fetch must never look like a
  // genuinely-empty org. Same pattern as settings page's usersLoadError.
  const [propertiesLoadError, setPropertiesLoadError] = useState(false);
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
    setPropertiesLoadError(false);
    apiListPropertiesPage(currentPage, rowsPerPage, propertyListFilters)
      .then((result) => {
        if (cancelled) return;
        setServerProperties(result.rows.map(mapApiPropertyToFrontend));
        setServerTotalCount(result.totalCount);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Could not load the properties list page:", err);
        setServerProperties([]);
        setServerTotalCount(0);
        setPropertiesLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setServerPropertiesLoading(false);
      });
    return () => { cancelled = true; };
    // propertyFiltersKey captures every filter input in one stable string so
    // this effect re-fires exactly when a real filter value changes, without
    // needing every individual filter piece listed separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, propertyFiltersKey, propertiesRefreshNonce, manualRefreshSignal]);

  const totalRows = serverTotalCount;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const clampedPage = Math.min(currentPage, totalPages);
  // serverProperties already *is* the current page — no slicing needed.
  const pageRows = serverProperties;

  const handleRegisterInterest = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = collectErrors({
      name: validatePersonName(interestName, { label: "Client name" }),
      phone: validatePhone(interestPhone, { required: true }),
      email: validateEmail(interestEmail)
    });
    setInterestErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Used to just show a success message with nothing saved anywhere —
    // this form's own copy ("initiate lead follow-up logs") always meant
    // to create a real lead. assignedAgent is the person registering the
    // interest (whoever's at this property with the client right now),
    // same as how Manual Ingestion Entry assigns a freshly-captured lead.
    const res = addLead({
      name: interestName.trim(),
      phone: interestPhone,
      email: interestEmail.trim(),
      assignedAgent: currentUser?.name || "",
      source: "Property Interest",
      property: selectedProperty?.name,
      leadScore: 85,
      createdAtStr: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    });
    if (!res.success) {
      setInterestErrors({ phone: res.error });
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

    const errors = validatePropertyDetails({
      developer: editDev, name: editName, propertyType: editType, price: editPrice,
      leadRegistrationUrl: editLeadRegUrl, contactNumber: editContactNumber, location: editLoc, mapUrl: editMapUrl
    });
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast("Please fix the highlighted fields.", "warning");
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

    if (popupDirty && !(await saveLinkers())) {
      toast("Couldn't save the connected campaigns / sheets. Please check and try again.", "error");
      return;
    }

    editProperty(selectedProperty.id, {
      name: editName.trim(),
      developer: editDev.trim(),
      location: editLoc.trim(),
      price: editPrice.trim(),
      type: editType,
      propertyStatus: editStatus || undefined,
      possessionDate: editPossessionDate || undefined,
      // "" (not undefined) so clearing an optional field really clears it.
      leadRegistrationUrl: editLeadRegUrl.trim(),
      contactNumber: editContactNumber.trim() ? normalizeIndianMobile(editContactNumber) ?? "" : "",
      mapUrl: editMapUrl.trim(),
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
          <table className={`table-fixed w-full border-collapse text-xs min-w-[1106px]`}>
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              {/* Campaigns column — Admin-only, see below */}
              {isAdmin && <col />}
              <col className="w-[56px]" />
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
                <th className="px-2 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {propertiesLoadError ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="p-8">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      <p className="text-xs font-semibold text-slate-600">Couldn&apos;t load properties.</p>
                      <button
                        type="button"
                        onClick={() => setPropertiesRefreshNonce(n => n + 1)}
                        className="px-4 py-1.5 rounded-lg bg-[#0B1E6E] hover:bg-[#081650] text-white text-xs font-bold transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : serverPropertiesLoading && pageRows.length === 0 ? (
                <TableRowsSkeleton rows={6} columns={isAdmin ? 8 : 7} />
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="p-8 text-center text-slate-400 font-semibold italic">
                    No properties match the current filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((p) => (
                  <tr key={p.id} onClick={() => openDrawer(p, false)} className="hover:bg-slate-50/60 transition-colors cursor-pointer">
                    <td className="px-4 py-3 align-top">
                      <button onClick={(e) => { e.stopPropagation(); openDrawer(p, false); }} className="text-left group [overflow-wrap:anywhere]">
                        <span className="block font-bold text-slate-800 group-hover:text-brand-700 transition-colors">{p.developer}</span>
                        <span className="block text-[11px] text-slate-450">{p.name}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600"><div className="[overflow-wrap:anywhere]">{p.location || "—"}</div></td>
                    <td className="px-4 py-3 align-top text-slate-600"><div className="[overflow-wrap:anywhere]">{p.type}</div></td>
                    <td className="px-4 py-3 align-top font-semibold text-slate-800 whitespace-nowrap">{p.price ? `${p.price}*` : "—"}</td>
                    <td className="px-4 py-3 align-top text-slate-500"><DateTimeLines {...dateTimeParts(p.createdAt)} /></td>
                    <td className="px-4 py-3 align-top text-slate-600">
                      {/* Just the label here; the names list is in the property popup. */}
                      <div className="[overflow-wrap:anywhere]">{teamLabelForProperty(p)}</div>
                    </td>
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
                    <td className="px-2 py-3 align-top text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = e.currentTarget.getBoundingClientRect();
                          setRowMenu(prev => (prev?.property.id === p.id ? null : { property: p, top: r.bottom + 4, right: window.innerWidth - r.right }));
                        }}
                        aria-label="More actions"
                        aria-haspopup="menu"
                        aria-expanded={rowMenu?.property.id === p.id}
                        className={`inline-flex items-center justify-center h-10 w-10 sm:h-8 sm:w-8 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors ${rowMenu?.property.id === p.id ? "bg-slate-100 text-slate-800" : ""}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
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

      {/* Detail / Edit popup — portaled to <body> like the other app modals
          (an ancestor's transform would otherwise offset a fixed overlay). */}
      {selectedProperty && createPortal(
        <>
          <div
            className={`fixed inset-0 bg-slate-900/60 z-50 transition-opacity duration-200 ${isDrawerOpen ? "opacity-100" : "opacity-0"}`}
            onClick={requestCloseDrawer}
          />
          <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={(e) => { if (e.target === e.currentTarget) requestCloseDrawer(); }}
          >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="property-dialog-title"
            className={`w-full sm:max-w-2xl max-h-[90vh] max-h-[90dvh] flex flex-col overflow-hidden bg-white border-0 sm:border border-slate-200 rounded-t-2xl sm:rounded-2xl shadow-2xl transition-all duration-200 ${
              isDrawerOpen ? "opacity-100 translate-y-0 sm:scale-100" : "opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            }`}
          >
            <div className="shrink-0 flex items-start justify-between gap-6 px-6 sm:px-8 pt-6 pb-5 border-b border-slate-200">
              <div className="min-w-0">
                <h3 id="property-dialog-title" className="text-base font-semibold text-slate-900">
                  {isEditing && isAdmin ? `Edit ${selectedProperty.name}` : selectedProperty.name}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
                  {[selectedProperty.developer, selectedProperty.location].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={requestCloseDrawer} aria-label="Close" className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-7">
              {isEditing && isAdmin ? (
                <form onSubmit={handleSavePropertyEdit} noValidate className="space-y-4 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Name</label>
                    <input type="text" maxLength={200} value={editName} onChange={(e) => { setEditName(e.target.value); clearEditError("name"); }} aria-invalid={!!editErrors.name} className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!editErrors.name)}`} />
                    <FieldError message={editErrors.name} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Builder Name</label>
                    <input type="text" maxLength={200} value={editDev} onChange={(e) => { setEditDev(e.target.value); clearEditError("developer"); }} aria-invalid={!!editErrors.developer} className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!editErrors.developer)}`} />
                    <FieldError message={editErrors.developer} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Property Type</label>
                      <SearchableMultiSelect
                        variant="field"
                        options={propertyTypeOptions(editType)}
                        selected={splitPropertyTypes(editType)}
                        onChange={(next) => { setEditType(joinPropertyTypes(next)); clearEditError("propertyType"); }}
                        placeholder="Select property type(s)"
                        searchPlaceholder="Search property types..."
                      />
                      <FieldError message={editErrors.propertyType} />
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
                      <input type="text" maxLength={40} placeholder="e.g. 1.91 Cr or 85 Lakh" value={editPrice} onChange={(e) => { setEditPrice(e.target.value); clearEditError("price"); }} aria-invalid={!!editErrors.price} className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none font-mono ${fieldErrorClass(!!editErrors.price)}`} />
                      <FieldError message={editErrors.price} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Lead Registration URL</label>
                    <input type="url" inputMode="url" maxLength={1000} placeholder="https://..." value={editLeadRegUrl} onChange={(e) => { setEditLeadRegUrl(e.target.value); clearEditError("leadRegistrationUrl"); }} aria-invalid={!!editErrors.leadRegistrationUrl} className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!editErrors.leadRegistrationUrl)}`} />
                    <FieldError message={editErrors.leadRegistrationUrl} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Contact Number</label>
                    <input {...phoneInputProps} placeholder="e.g. 9845012345" value={editContactNumber} onChange={(e) => { setEditContactNumber(sanitizePhoneInput(e.target.value)); clearEditError("contactNumber"); }} aria-invalid={!!editErrors.contactNumber} className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!editErrors.contactNumber)}`} />
                    <FieldError message={editErrors.contactNumber} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Location</label>
                      <input type="text" maxLength={300} value={editLoc} onChange={(e) => { setEditLoc(e.target.value); clearEditError("location"); }} aria-invalid={!!editErrors.location} className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!editErrors.location)}`} />
                      <FieldError message={editErrors.location} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Map URL</label>
                      <input type="url" inputMode="url" maxLength={1000} placeholder="https://maps.google.com/..." value={editMapUrl} onChange={(e) => { setEditMapUrl(e.target.value); clearEditError("mapUrl"); }} aria-invalid={!!editErrors.mapUrl} className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!editErrors.mapUrl)}`} />
                      <FieldError message={editErrors.mapUrl} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Description</label>
                    <textarea value={editDesc} maxLength={5000} onChange={(e) => setEditDesc(e.target.value)} rows={3} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none" />
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
                    <MetaCampaignLinker ref={metaLinkerRef} onDirtyChange={onMetaDirty} propertyId={selectedProperty.id} isAdmin={isAdmin} />
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <GoogleCampaignLinker ref={googleLinkerRef} onDirtyChange={onGoogleDirty} propertyId={selectedProperty.id} isAdmin={isAdmin} />
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <SheetSourceLinker ref={sheetLinkerRef} onDirtyChange={onSheetDirty} propertyId={selectedProperty.id} isAdmin={isAdmin} />
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
                  {/* Quick actions — icon buttons with a hover label */}
                  <div className="flex items-center gap-2">
                    <IconAction label="Share on WhatsApp" onClick={() => handleShareProperty(selectedProperty)}>
                      <WhatsAppIcon className="h-4 w-4" />
                    </IconAction>
                    <IconAction label="Copy details" onClick={() => handleCopyPropertyText(selectedProperty)}>
                      <Copy className="h-4 w-4" />
                    </IconAction>
                    <IconAction label="Download brochure" onClick={() => handleDownloadProperty(selectedProperty)}>
                      <Download className="h-4 w-4" />
                    </IconAction>
                    {isAdmin && (
                      <IconAction label="Edit" onClick={() => setIsEditing(true)}>
                        <Edit className="h-4 w-4" />
                      </IconAction>
                    )}
                  </div>

                  {/* Key facts — plain label / value pairs */}
                  <dl className="grid grid-cols-2 gap-x-8 gap-y-5">
                    <div className="col-span-2">
                      <dt className="text-xs text-slate-500">Price</dt>
                      <dd className="text-lg font-semibold text-slate-900 mt-0.5">{priceLabel(selectedProperty) ?? "On request"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Status</dt>
                      <dd className="text-sm font-medium text-slate-900 mt-0.5">{selectedProperty.propertyStatus || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Possession</dt>
                      <dd className="text-sm font-medium text-slate-900 mt-0.5">{possessionLabel(selectedProperty.possessionDate) ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Type</dt>
                      <dd className="text-sm font-medium text-slate-900 mt-0.5">{selectedProperty.type || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Added on</dt>
                      <dd className="text-sm font-medium text-slate-900 mt-0.5">
                        {selectedProperty.createdAt
                          ? new Date(selectedProperty.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Assigned team</dt>
                      <dd className="text-sm font-medium text-slate-900 mt-0.5">
                        {teamMembersToList(selectedProperty).length > 1 ? (
                          <button type="button" onClick={() => toggleMyTeamOnProperty(selectedProperty)} className="text-brand-700 hover:underline">
                            {teamLabelForProperty(selectedProperty)}
                          </button>
                        ) : (teamLabelForProperty(selectedProperty) || "—")}
                      </dd>
                    </div>
                    {selectedProperty.teamAssignmentMode === "CUSTOM_MEMBERS" && selectedProperty.leadAssignmentMode && (
                      <div>
                        <dt className="text-xs text-slate-500">Lead assignment</dt>
                        <dd className="text-sm font-medium text-slate-900 mt-0.5">{selectedProperty.leadAssignmentMode === "ROUND_ROBIN" ? "Round robin" : "Percentage split"}</dd>
                      </div>
                    )}
                    {teamMembersToList(selectedProperty).length > 1 && expandedTeamPropertyId === selectedProperty.id && (
                      <div className="col-span-2">
                        <div className="flex flex-col gap-1 border border-slate-200 rounded-lg px-3 py-2 max-w-[260px] max-h-56 overflow-y-auto">
                          {teamMembersToList(selectedProperty).map(m => (
                            <span key={m.userId} className="text-sm text-slate-700 truncate" title={m.name}>
                              {m.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </dl>

                  {selectedProperty.description && (
                    <div className="border-t border-slate-200 pt-6">
                      <h4 className="text-sm font-semibold text-slate-900">Overview</h4>
                      <p className="text-sm text-slate-600 leading-6 whitespace-pre-line mt-2">{selectedProperty.description}</p>
                    </div>
                  )}

                  {/* Ad-source connection management is an Admin-only concern (API
                      credentials, platform account linking) — hidden entirely for
                      Manager/Member, not just made read-only, per the 2026-10-09
                      instruction. See project_crm_role_based_lead_scoping memory. */}
                  {isAdmin && (
                    <>
                      <div className="border-t border-slate-200 pt-6">
                        <MetaCampaignLinker ref={metaLinkerRef} onDirtyChange={onMetaDirty} propertyId={selectedProperty.id} isAdmin={isAdmin} />
                      </div>
                      <div className="border-t border-slate-200 pt-6">
                        <GoogleCampaignLinker ref={googleLinkerRef} onDirtyChange={onGoogleDirty} propertyId={selectedProperty.id} isAdmin={isAdmin} />
                      </div>
                      <div className="border-t border-slate-200 pt-6">
                        <SheetSourceLinker ref={sheetLinkerRef} onDirtyChange={onSheetDirty} propertyId={selectedProperty.id} isAdmin={isAdmin} />
                      </div>
                    </>
                  )}

                  <div className="border-t border-slate-200 pt-6 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Register client interest</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Adds the client as a lead for this property.</p>
                    </div>

                    {interestSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-100 text-[10px] text-emerald-700 rounded-lg font-semibold">
                        {interestSuccess}
                      </div>
                    )}

                    <form onSubmit={handleRegisterInterest} noValidate className="space-y-3">
                      <div>
                        <input type="text" maxLength={100} autoComplete="name" placeholder="Client Name" value={interestName} onChange={(e) => { setInterestName(e.target.value); setInterestErrors(p => ({ ...p, name: undefined })); }} aria-invalid={!!interestErrors.name} className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!interestErrors.name)}`} />
                        <FieldError message={interestErrors.name} />
                      </div>
                      <div>
                        <input {...phoneInputProps} placeholder="Phone Number" value={interestPhone} onChange={(e) => { setInterestPhone(sanitizePhoneInput(e.target.value)); setInterestErrors(p => ({ ...p, phone: undefined })); }} aria-invalid={!!interestErrors.phone} className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!interestErrors.phone)}`} />
                        <FieldError message={interestErrors.phone} />
                      </div>
                      <div>
                        <input type="email" maxLength={254} autoComplete="email" placeholder="Email address (optional)" value={interestEmail} onChange={(e) => { setInterestEmail(e.target.value); setInterestErrors(p => ({ ...p, email: undefined })); }} aria-invalid={!!interestErrors.email} className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none ${fieldErrorClass(!!interestErrors.email)}`} />
                        <FieldError message={interestErrors.email} />
                      </div>
                      <div className="flex justify-end gap-2">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={handleSavePopup}
                            disabled={!popupDirty || savingLinkers}
                            title={popupDirty ? "Save connected campaigns and sheets" : "No changes to save"}
                            className="h-9 px-4 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {savingLinkers ? "Saving..." : "Save"}
                          </button>
                        )}
                        <button type="submit" className="h-9 px-4 bg-[#0B1E6E] hover:bg-[#081650] text-white font-medium rounded-lg text-sm transition-colors">
                          Register interest
                        </button>
                      </div>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
          </div>
        </>,
        document.body
      )}

      {rowMenu && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
          <div
            role="menu"
            style={{ top: Math.min(rowMenu.top, window.innerHeight - 240), right: rowMenu.right }}
            className="fixed z-50 w-52 py-1.5 bg-white border border-slate-200 rounded-xl shadow-lg text-sm text-slate-700"
          >
            {[
              { label: "Share on WhatsApp", icon: <WhatsAppIcon className="h-4 w-4" />, run: () => handleShareProperty(rowMenu.property), show: true },
              { label: "Edit", icon: <Edit className="h-4 w-4 text-slate-500" />, run: () => openDrawer(rowMenu.property, true), show: isAdmin },
              { label: "Copy details", icon: <Copy className="h-4 w-4 text-slate-500" />, run: () => handleCopyPropertyText(rowMenu.property), show: true },
              { label: "Download brochure", icon: <Download className="h-4 w-4 text-slate-500" />, run: () => handleDownloadProperty(rowMenu.property), show: true }
            ].filter(i => i.show).map(item => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => { setRowMenu(null); item.run(); }}
                className="w-full flex items-center gap-3 px-3.5 py-2 text-left hover:bg-slate-50 transition-colors"
              >
                {item.icon}
                {item.label}
              </button>
            ))}
            {isAdmin && (
              <>
                <div className="my-1.5 border-t border-slate-100" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { const p = rowMenu.property; setRowMenu(null); handleDeleteProperty(p); }}
                  className="w-full flex items-center gap-3 px-3.5 py-2 text-left text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        </>,
        document.body
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
