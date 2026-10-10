"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { parseIndianPrice } from "@/lib/validation";
import {
  apiLogin,
  apiLogout,
  apiGetMe,
  apiListAllLeads,
  apiGetLead,
  apiCreateLead,
  apiBulkImportLeads,
  BulkImportLeadsApiInput,
  BulkImportLeadsApiResult,
  apiUpdateLeadStatus,
  apiEditLead,
  apiReassignLead,
  apiUpdateLeadNote,
  apiDeleteLead,
  apiVerifyLeadKyc,
  apiListUsers,
  apiCreateUser,
  apiEditUser,
  apiResetUserPassword,
  apiDeleteUser,
  apiListProperties,
  apiCreateProperty,
  apiEditProperty,
  apiDeleteProperty,
  apiListResaleUnits,
  apiCreateResaleUnit,
  apiListFollowups,
  apiCreateFollowup,
  apiListAttendance,
  apiListReimbursements,
  apiCreateReimbursement,
  apiApproveReimbursement,
  apiRejectReimbursement,
  apiDeleteReimbursement,
  apiListInvoices,
  apiCreateInvoice,
  apiGenerateInvoice,
  apiMarkInvoicePaid,
  apiDeleteInvoice,
  apiCreateNotificationStreamTicket,
  buildNotificationStreamUrl,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  apiClearNotifications,
  apiListCalendarEvents,
  apiCreateCalendarEvent,
  apiDeleteCalendarEvent,
  apiListAdSpend,
  apiListAdLevelSpend,
  apiTriggerAdSpendSync,
  apiListMetaConnections,
  apiSetPropertyTeamMembers,
  apiListTimesheets,
  apiPunchIn,
  apiPunchOut,
  apiSubmitRegularization,
  apiApproveRegularization,
  apiRejectRegularization,
  apiGetTenantSettings,
  apiUpdateTenantSettings,
  UpdateTenantSettingsInput,
  isApiSessionActive,
  clearApiSession,
  ApiUser,
  ApiLeadRow,
  ApiUserDirectoryEntry,
  ApiPropertyRow,
  ApiResaleUnitRow,
  ApiFollowupRow,
  ApiAttendanceRow,
  ApiReimbursementRow,
  ApiInvoiceRow,
  ApiNotificationRow,
  ApiCalendarEventRow,
  ApiAdSpendRow,
  ApiAdLevelSpendRow,
  ApiTimesheetRow,
  ApiTenantSettings,
  ApiRequestError,
  apiCreateCallAttempt,
  apiGetPendingCallAttempt,
  apiSubmitCallFeedback,
  ApiCallAttemptRow
} from "@/lib/apiClient";
import { dbCodeToFrontendStatus, frontendStatusToDbCode, isRealLeadId, isRealId } from "@/lib/leadStatusMapping";
import { initNotificationSoundUnlock, playNotificationSound } from "@/lib/notificationSound";
import { todayIso, toIsoDate } from "@/components/ui/DateRangePicker";
import { Capacitor } from "@capacitor/core";

// --- Types ---
export type Role = "ADMIN" | "FINANCE" | "AGENT";

export type SystemType = "CRM" | "HRMS" | "FINANCE" | "ADMIN";

export function getAvailableSystems(user: { role: string; department?: string } | null): SystemType[] {
  if (!user) return [];
  const systems: SystemType[] = [];
  
  if (user.role === "ADMIN" || user.department === "SALES") {
    systems.push("CRM");
  }
  
  if (user.role === "ADMIN" || (user.department && ["SALES", "TECH", "MARKETING", "FINANCE"].includes(user.department))) {
    systems.push("HRMS");
  }
  
  if (user.role === "ADMIN" || user.department === "FINANCE" || user.role === "FINANCE") {
    systems.push("FINANCE");
  }
  
  if (user.role === "ADMIN") {
    systems.push("ADMIN");
  }
  
  return systems;
}

export function getDefaultSystem(user: { role: string; department?: string } | null): SystemType {
  if (!user) return "CRM";
  if (user.role === "ADMIN") return "ADMIN";
  if (user.department === "SALES") return "CRM";
  if (user.department === "FINANCE" || user.role === "FINANCE") return "FINANCE";
  return "HRMS";
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  passwordStatus: "TEMPORARY" | "ACTIVE";
  tempPassword?: string;
  
  // Database fields mapped from Data Dictionary (taskezy_users and admin_users tables)
  user_id?: string;
  admin_id?: string;
  employee_code?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  company_email?: string;
  personal_email?: string;
  dob?: string;
  designation?: string;
  role_type?: "Manager" | "Member";
  employment_type?: "FULL TIME" | "FREELANCER" | "INTERN" | "AGENCY";
  department?: "SALES" | "TECH" | "MARKETING" | "FINANCE";
  status?: "ACTIVE" | "INACTIVE";
  managerId?: string; // real reporting-line relationship — who this person reports to
  managerName?: string;
  password_hash?: string;
  created_at?: string;
  updated_at?: string;
}

export type LeadStatus =
  | "New Lead"
  | "New"
  | "Revived"
  | "Lead Pool"
  | "After RERA"
  | "Interested"
  | "Follow up"
  | "Call Back"
  | "Meeting Scheduled"
  | "Meeting Done"
  | "Site Visit Scheduled"
  | "Site Visit Done"
  | "In Negotiation"
  | "Booking Done"
  | "Finance Review"
  | "Booking Approved"
  | "Finance Rejected"
  | "Dead"
  | "Unassigned"
  | "RNR"
  | "Switch off"
  | "Booked"
  | "New Leads"
  | "Assigned"
  | "Connected"
  | "Follow-ups"
  | "Visit Schedule"
  | "Not Interested"
  | "EOI Customers"
  | "Invalid"
  | "Low Budget"
  | "Site Visit"
  | "Completed";

export interface LeadLog {
  timestamp: string;
  message: string;
  user: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: LeadStatus;
  dealValue?: number; // INR
  kycDocName?: string;
  kycDocUrl?: string;
  kycVerified: boolean;
  assignedAgent: string;
  assignedAgentId?: string;
  logs: LeadLog[];
  source?: string;
  subSource?: string; // free-text batch label from bulk upload (e.g. "Kashmiri Data") — lets that batch be filtered/reassigned/reshuffled as a group. undefined for every other ingestion path.
  subStatus?: "Qualified" | "Not Qualified"; // Data Calling's Connected sub-status — only meaningful while status is "Connected", cleared on any other status change.
  createdAtStr?: string;
  campaign?: string;
  metaPageName?: string; // which connected Meta Page this lead came in through
  metaFormId?: string; // which Lead Ad Form on that Page
  metaAdId?: string; // which real Meta ad this lead's submission came from — matches AdLevelSpendRecord.adId for a "platform": "META" row. Google leads have no per-lead ad attribution at all (Sheets-import pipeline, not a webhook), so this stays undefined for them — a real gap, not a bug.
  property?: string;
  leadScore?: number;

  // SLA / missed-lead tracking (report parameter: missed = no status update within 20 min of assignment)
  assignedAt?: string; // ISO — when the lead was (last) assigned to its current agent
  firstResponseAt?: string; // ISO — first time status was changed away from the initial state
  reassignedAt?: string; // ISO — set when the lead was moved to a different agent
  previousAgent?: string; // agent the lead was reassigned away from
  notes?: string; // the lead's current note, written by a person
  notesUpdatedAt?: string;
  notesUpdatedBy?: string;
}

export interface AdSpendRecord {
  id: string;
  platform: "Meta" | "Google";
  accountName: string;
  property?: string;
  date: string; // YYYY-MM-DD
  spend: number;
  leadsGenerated: number;
  campaignStatus?: "ACTIVE" | "INACTIVE"; // undefined for records with no linked Meta campaign (legacy/manual rows)
}

// Real per-ad, per-day spend/leads with each row's real ad set/ad/creative
// name attached — one level finer than AdSpendRecord (per ad instead of
// per campaign), for Campaign Deep Dive's Ad Set Name/Ad creative Name
// columns and a real per-ad-set/ad-creative CPL breakdown. Covers both
// Meta and Google (platform-tagged) under one shape — creativeName is
// real and Meta-only, adType is real and Google-only (its honest fallback
// label when ad.name is unset), never both on the same row.
export interface AdLevelSpendRecord {
  platform: "Meta" | "Google";
  adId: string;
  adName: string | null;
  creativeName?: string;
  adType?: string;
  adSetName: string;
  campaignId: string;
  campaignName: string;
  campaignStatus: "ACTIVE" | "INACTIVE";
  date: string; // YYYY-MM-DD
  spend: number;
  leadsGenerated: number;
}

// Real, admin-editable business rules — previously hardcoded (geofence
// coords client-side, half-day threshold/GST rate/due-days server-side).
export interface TenantSettings {
  officeLat: number;
  officeLng: number;
  geofenceRadiusMeters: number;
  halfDayThresholdHours: number;
  gstRate: number;
  invoiceDueDays: number;
}

export type PropertyTeamAssignmentMode = "ALL_MEMBERS" | "CUSTOM_MEMBERS";
export type LeadAssignmentMode = "ROUND_ROBIN" | "PERCENTAGE";

export interface PropertyTeamMember {
  userId: string;
  name: string;
  percentage?: number; // used when leadAssignmentMode === "PERCENTAGE"
}

export interface Property {
  id: string;
  name: string;
  developer: string;
  location: string;
  locality?: string;
  zone?: string;
  price?: string;
  priceType?: "Absolute" | "Starting From";
  type: string;
  propertyStatus?: string;
  membersCount: number;
  description?: string;
  possessionDate?: string;
  projectStatus?: string;
  landParcel?: string;
  towers?: string;
  structure?: string;
  amenities?: string[];
  contactNumber?: string;
  mapUrl?: string;
  websiteUrl?: string;
  brochureUrl?: string;
  leadRegistrationUrl?: string;
  tags?: string[];
  mediaFileNames?: string[];
  teamAssignmentMode?: PropertyTeamAssignmentMode;
  leadAssignmentMode?: LeadAssignmentMode;
  assignedTeam?: PropertyTeamMember[];
  createdAt?: string;
}

export interface ResaleUnit {
  id: string;
  property: string;
  builder: string;
  location: string;
  price: string;
  description: string;
  listedBy: string;
}

export interface FollowupCall {
  id: string;
  leadId?: string;
  date: string; // YYYY-MM-DD, for report date-range filtering
  time: string;
  scheduledAt?: string; // raw ISO timestamp — date/time above are display-only and lose precision
  status: "Missed" | "Upcoming" | "Completed";
  leadName: string;
  phone: string;
  type: "Callback" | "Meeting" | "Site Visit";
  assignedTo: string;
  dueNotifiedAt?: string; // when the "reminder due" alert fired — the SLA clock's start
  violationNotifiedAt?: string; // when it was escalated to admins as overdue
}

export interface AttendanceRecord {
  employeeName: string;
  email: string;
  designation: string;
  presentDays: number;
  totalDays: number;
  onTime: number;
  late: number;
}

export interface ReimbursementClaim {
  id: string;
  title: string;
  type: string;
  amount: number;
  status: "Pending" | "Paid" | "Rejected";
  date: string;
  agentName: string;
  notes?: string;
}

export interface TimesheetLog {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  punchIn: string; // ISO string
  punchOut?: string; // ISO string
  punchInLat?: number;
  punchInLng?: number;
  durationHours?: number;
  status: "Full Day" | "Half Day" | "Regularization Pending" | "Regularized";
  regularizationRequest?: {
    requestedIn: string;
    requestedOut: string;
    reason: string;
    submittedAt: string;
  };
}

export interface Invoice {
  id: string;
  invoiceNumber?: string; // INV-2026-xxxx
  leadId: string;
  clientName: string;
  baseAmount: number;
  cgst: number; // 9%
  sgst: number; // 9%
  totalAmount: number; // 18% GST
  status: "Draft" | "Paid" | "Overdue";
  createdAt: string;
  dueDate: string;
  developerName?: string;
  projectName?: string;
  unitNo?: string;
  unitDimension?: string;
  brokerageType?: "Percentage" | "Flat";
  brokerageRate?: string;
  collectionStatus?: "Pending" | "Partially Collected" | "Collected";
  collectedAmount?: number;
}

export type NotificationCategory =
  | "NEW_LEAD"
  | "REMINDER"
  | "REGULARIZATION"
  | "ATTENDANCE"
  | "LEAVE"
  | "INVOICE"
  | "CLAIM"
  | "KYC"
  | "GENERAL"
  | "REASSIGNMENT"
  | "MISSED_SLA";

export interface Notification {
  id: string;
  system: SystemType; // CRM | HRMS | FINANCE (ADMIN aggregates, never a creation target)
  category: NotificationCategory;
  title: string;
  message: string;
  timestamp: string; // ISO
  read: boolean;
  leadId?: string; // CRM: opens the Lead Detail Drawer directly
  link?: string; // HRMS/Finance: route to navigate to
}

// Mirrors the server (notifications.service.ts): lead-linked alerts in these
// categories stay until the lead is acted on; every other notification is
// informational and is deleted once read.
const LEAD_ACTIVITY_CATEGORIES: NotificationCategory[] = ["REMINDER", "MISSED_SLA", "GENERAL", "REASSIGNMENT", "KYC"];
const isLeadActivity = (n: Notification) => !!n.leadId && LEAD_ACTIVITY_CATEGORIES.includes(n.category);

export type CalendarEventType =
  | "SITE_VISIT"
  | "FOLLOWUP"
  | "BOOKING"
  | "EOI"
  | "HOLIDAY"
  | "ABSENCE"
  | "ADMIN_EVENT"
  | "PAYMENT_REMINDER"
  | "TASK";

export interface CalendarEvent {
  id: string;
  system: SystemType; // CRM | HRMS | FINANCE (ADMIN aggregates, never a creation target)
  type: CalendarEventType;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm optional
  description?: string;
  leadId?: string; // CRM: opens the Lead Detail Drawer directly
  employeeNames?: string[]; // HRMS ABSENCE: which employees were out that day
  createdBy?: string; // HRMS ADMIN_EVENT: who scheduled it
  amount?: number; // FINANCE: reminder/task amount
}

interface AppState {
  // Subscription Settings
  adminSeats: number;
  financeSeats: number;
  agentSeats: number;
  isPaid: boolean;
  isProvisioned: boolean;
  
  // Auth
  users: User[];
  currentUser: User | null;
  // True until the initial session-restore check (stored token -> /auth/me) completes.
  // Use this to avoid redirecting to /auth/login before that check has had a chance to run.
  authLoading: boolean;
  // True from session start until every domain list (leads, users,
  // properties, ...) has loaded at least once in the background — login/
  // session-restore no longer block on this, so a page can be showing
  // empty lists for a moment after either. Read this to tell "still
  // loading" apart from "genuinely empty" instead of flashing a false
  // empty state.
  isDataLoading: boolean;
  // Increments whenever the server reports a lead changed anywhere (status,
  // reassignment, edit, delete, new lead) — list a page's own fetch effect's
  // deps on this to have it refetch live. See the "leads-changed" SSE listener.
  leadsChangedSignal: number;
  // Pull-to-refresh (mobile) calls this — same refresh path the live signal
  // uses, plus a full reload of every bulk-loaded domain, so there's one
  // refresh mechanism in the app, not two.
  triggerManualRefresh: () => void;
  activeRole: Role; // For easy switcher
  activeSystem: SystemType;
  showLoginSplash: boolean;
  setShowLoginSplash: (show: boolean) => void;
  
  // App Modules Data
  leads: Lead[]; // everything EXCEPT bulk-uploaded (Data Calling) leads — see dataCallingLeads
  dataCallingLeads: Lead[]; // ONLY bulk-uploaded leads — the two are mutually exclusive
  properties: Property[];
  resaleUnits: ResaleUnit[];
  followupCalls: FollowupCall[];
  attendanceRecords: AttendanceRecord[];
  reimbursements: ReimbursementClaim[];
  timesheets: TimesheetLog[];
  invoices: Invoice[];
  notifications: Notification[];
  calendarEvents: CalendarEvent[];
  // Set once the native call-state plugin reports a call ended (and
  // restored on session start if one was left unresolved by a force-quit)
  // — non-null blocks the whole app behind CallFeedbackGate until
  // submitCallFeedback resolves it. Native app + Manager/Member only; see
  // project_crm_role_based_lead_scoping memory (2026-10-10).
  pendingCallAttempt: ApiCallAttemptRow | null;
  adSpendRecords: AdSpendRecord[];
  adLevelSpendRecords: AdLevelSpendRecord[];
  refetchAdLevelSpend: () => Promise<void>;
  triggerAdSpendSync: () => Promise<{ meta: { started: boolean }; google: { started: boolean } }>;
  bulkImportLeads: (input: BulkImportLeadsApiInput) => Promise<BulkImportLeadsApiResult>;

  // System State
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  metaConnected: boolean;
  tenantSettings: TenantSettings | null;
}

interface AppActions {
  refreshMetaConnectionStatus: () => Promise<void>;
  // Called by the CallState plugin's "callEnded" listener (native app only)
  // right as the call ends, before the feedback modal even renders — this
  // is what makes the gate durable across a force-quit (see
  // pendingCallAttempt above).
  recordCallEnded: (leadId: string, startedAt: string | undefined, durationSeconds: number) => Promise<void>;
  // Called by the WhatsApp trigger (web + app) once the agent returns to
  // Taskezy after wa.me opened — see recordCallEnded above for the call
  // equivalent; same gate, no call-state plugin involved for this channel.
  recordWhatsAppOpened: (leadId: string) => Promise<void>;
  // Submits the blocking gate's form and clears pendingCallAttempt.
  submitCallFeedback: (outcome: string, notes: string) => Promise<void>;
  updateTenantSettings: (input: UpdateTenantSettingsInput) => Promise<{ success: boolean; error?: string }>;
  // SaaS actions
  setSeats: (role: Role, count: number) => void;
  processPayment: () => Promise<boolean>;
  provisionTenant: () => Promise<void>;
  resetRosterPassword: (userId: string, newPass: string) => void;
  /**
   * Waits for the server; throws its message on failure. `newPassword` empty
   * keeps the user's current password — it's only reset when one is typed.
   */
  updateUserFields: (
    userId: string,
    firstName: string,
    lastName: string,
    newPassword: string,
    designation: string,
    roleType: "Manager" | "Member",
    status: "ACTIVE" | "INACTIVE",
    managerId?: string | null
  ) => Promise<void>;
  setCurrentUserPasswordActive: () => void;
  // errorType distinguishes genuinely wrong credentials (401/403) from the
  // login endpoint's own rate limiter (429 — 10 attempts/15min, real and
  // enforced server-side) from the API being unreachable entirely (network
  // failure, CORS, or a 5xx — e.g. mid-deploy restart), so the login screen
  // can show an accurate message for each instead of blaming the password
  // for either a server outage or simply having tried too many times.
  loginWithTempPassword: (
    email: string,
    pass: string
  ) => Promise<{ user: User } | { user: null; errorType: "invalid_credentials" | "rate_limited" | "network" }>;
  logout: () => void;
  switchUserRole: (role: Role, userId?: string) => void;
  setActiveSystem: (system: SystemType) => void;

  // CRM actions
  addLead: (lead: Omit<Lead, "id" | "status" | "kycVerified" | "logs">) => { success: boolean; error?: string };
  updateLeadStatus: (
    leadId: string,
    status: LeadStatus,
    dealValue?: number,
    kycDocName?: string,
    subStatus?: "Qualified" | "Not Qualified"
  ) => { success: boolean; error?: string };
  reassignLead: (leadId: string, newAgent: string, note: string) => Promise<void>;
  /** Saves the lead's current note; resolves with the updated lead (or null for a local-only lead). */
  updateLeadNote: (leadId: string, note: string) => Promise<Lead | null>;
  connectMeta: () => Promise<void>;
  disconnectMeta: () => void;

  // Property actions
  addProperty: (property: Omit<Property, "id" | "membersCount">) => void;
  addResaleUnit: (unit: Omit<ResaleUnit, "id">) => void;

  // Reimbursement actions
  addReimbursementClaim: (claim: Omit<ReimbursementClaim, "id" | "status" | "date">) => void;
  approveClaim: (id: string) => void;
  rejectClaim: (id: string) => void;

  // HRMS actions
  punchIn: (lat: number, lng: number) => Promise<{ success: boolean; error?: string }>;
  punchOut: () => Promise<{ success: boolean; error?: string }>;
  submitRegularization: (timesheetId: string, requestedIn: string, requestedOut: string, reason: string) => void;
  approveRegularization: (timesheetId: string) => void;
  rejectRegularization: (timesheetId: string) => void;

  // Finance actions
  verifyKYC: (leadId: string) => void;
  addInvoice: (leadId: string, clientName: string, baseAmount: number, projectName?: string) => { success: boolean; error?: string };
  generateInvoice: (invoiceId: string) => void;
  markInvoicePaid: (invoiceId: string) => void;

  // CRUD actions for Admin
  /** Waits for the server; throws its message (e.g. email already in use) on failure. */
  addTeamMember: (user: Omit<User, "id" | "created_at" | "updated_at">) => Promise<void>;
  /** Waits for the server; throws its message on failure. `handover` is required when the user holds leads. */
  deleteTeamMember: (userId: string, handover?: { reassignTo: string[]; note: string }) => Promise<{ reassignedLeads: number }>;
  deleteLead: (leadId: string) => void;
  removeLeadsLocally: (leadIds: string[]) => void;
  editLead: (leadId: string, updatedFields: Partial<Lead>) => void;
  deleteProperty: (propertyId: string) => void;
  editProperty: (propertyId: string, updatedFields: Partial<Property>) => void;
  deleteInvoice: (invoiceId: string) => void;
  deleteClaim: (claimId: string) => void;

  // Connection settings
  setOnlineStatus: (status: boolean) => void;
  triggerSync: () => Promise<void>;

  // Notification actions
  addNotification: (notification: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (system?: SystemType) => void;
  clearNotifications: (system?: SystemType) => Promise<void>;

  // Calendar actions
  addCalendarEvent: (event: Omit<CalendarEvent, "id">) => void;
  addFollowupCall: (input: { scheduledAt: string; leadId?: string; leadName: string; phone?: string; callType: "CALLBACK" | "MEETING" | "SITE_VISIT"; assignedToName: string }) => void;
  deleteCalendarEvent: (id: string) => void;
}

const AppContext = createContext<(AppState & AppActions) | undefined>(undefined);

// All mock/demo seed data (INITIAL_LEADS, INITIAL_PROPERTIES, etc.) was removed here — every
// domain is fetched from the real API now. See loadAllRealData() below and the 2026-07-21+
// entries in IMPLEMENTATIONS.md. The functions below map each API response shape to the
// frontend's existing (pre-backend) type shapes, so downstream components didn't need to change.

function mapApiUserToFrontendUser(apiUser: ApiUser): User {
  return {
    id: apiUser.id,
    name: `${apiUser.first_name}${apiUser.last_name ? " " + apiUser.last_name : ""}`,
    email: apiUser.email,
    company_email: apiUser.email,
    role: apiUser.role,
    passwordStatus: "ACTIVE",
    first_name: apiUser.first_name,
    last_name: apiUser.last_name || undefined,
    designation: apiUser.designation || undefined,
    role_type: apiUser.role_type === "MANAGER" ? "Manager" : apiUser.role_type === "MEMBER" ? "Member" : undefined,
    department: (apiUser.department as User["department"]) || undefined,
    status: "ACTIVE"
  };
}

// Exported so LeadDashboard's server-paginated table can map its own
// directly-fetched pages without duplicating this logic — every other
// caller still goes through the full-array AppContext load.
export function mapApiLeadToFrontendLead(row: ApiLeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || "",
    status: dbCodeToFrontendStatus(row.status_code),
    dealValue: row.deal_value ? Number(row.deal_value) : undefined,
    kycVerified: false, // not included in the leads list endpoint yet
    assignedAgent: row.assigned_agent_name,
    assignedAgentId: row.assigned_agent_id,
    previousAgent: row.previous_agent_name || undefined,
    reassignedAt: row.reassigned_at || undefined,
    notes: row.notes || undefined,
    notesUpdatedAt: row.notes_updated_at || undefined,
    notesUpdatedBy: row.notes_updated_by_name || undefined,
    logs: row.logs.map(l => ({ message: l.message, timestamp: l.timestamp, user: l.user })),
    source: row.source || undefined,
    subSource: row.sub_source || undefined,
    subStatus: row.sub_status === "Qualified" || row.sub_status === "Not Qualified" ? row.sub_status : undefined,
    campaign: row.campaign || undefined,
    metaPageName: row.meta_page_name || undefined,
    metaFormId: row.meta_form_id || undefined,
    metaAdId: row.meta_ad_id || undefined,
    property: row.property_name || undefined,
    leadScore: row.lead_score ?? undefined,
    assignedAt: row.assigned_at || undefined,
    firstResponseAt: row.first_response_at || undefined,
    createdAtStr: row.created_at
  };
}

// Exported so the Settings "Manage Users" table's server-paginated fetch can
// map its own directly-fetched page without duplicating this logic — same
// convention as mapApiLeadToFrontendLead/mapApiCalendarEventToFrontend above.
// Every other users consumer (dropdowns, name resolution, this file's own
// bulk load) still goes through the full-array AppContext load.
export function mapApiUserDirectoryEntryToFrontendUser(row: ApiUserDirectoryEntry): User {
  return {
    id: row.id,
    name: `${row.first_name}${row.last_name ? " " + row.last_name : ""}`,
    email: row.email,
    company_email: row.email,
    role: row.role as Role,
    passwordStatus: "ACTIVE",
    first_name: row.first_name,
    last_name: row.last_name || undefined,
    designation: row.designation || undefined,
    role_type: row.role_type === "MANAGER" ? "Manager" : row.role_type === "MEMBER" ? "Member" : undefined,
    department: (row.department as User["department"]) || undefined,
    managerId: row.manager_id || undefined,
    managerName: row.manager_name || undefined,
    status: "ACTIVE"
  };
}

// "₹1.255 Cr" / "₹85 L" — precise enough that re-saving an edited property
// (which sends this string back through parsePriceToValue) keeps the price.
function formatPriceValue(value: string | null, priceType: string | null): string | undefined {
  if (!value) return undefined;
  const rupees = Number(value);
  if (!Number.isFinite(rupees)) return undefined;
  const trim = (n: number, digits: number) => String(Number(n.toFixed(digits)));
  const formatted = rupees >= 1e7 ? `₹${trim(rupees / 1e7, 4)} Cr` : `₹${trim(rupees / 1e5, 2)} L`;
  return priceType === "STARTING_FROM" ? `${formatted}+` : formatted;
}

export function mapApiPropertyToFrontend(row: ApiPropertyRow): Property {
  return {
    id: row.id,
    name: row.name,
    developer: row.developer,
    location: row.location,
    locality: row.locality || undefined,
    zone: row.zone || undefined,
    createdAt: row.created_at,
    price: formatPriceValue(row.price_value, row.price_type),
    priceType: row.price_type === "STARTING_FROM" ? "Starting From" : row.price_type === "ABSOLUTE" ? "Absolute" : undefined,
    type: row.property_type,
    propertyStatus: row.property_status || undefined,
    membersCount: row.team_members.length,
    assignedTeam: row.team_members.length > 0
      ? row.team_members.map(m => ({ userId: m.userId, name: m.name, percentage: m.percentage ?? undefined }))
      : undefined,
    description: row.description || undefined,
    possessionDate: row.possession_date || undefined,
    landParcel: row.land_parcel || undefined,
    towers: row.towers || undefined,
    structure: row.structure || undefined,
    amenities: row.amenities || undefined,
    contactNumber: row.contact_number || undefined,
    mapUrl: row.map_url || undefined,
    websiteUrl: row.website_url || undefined,
    brochureUrl: row.brochure_url || undefined,
    leadRegistrationUrl: row.lead_registration_url || undefined,
    tags: row.tags || undefined,
    mediaFileNames: row.media_file_names || undefined,
    teamAssignmentMode: row.team_assignment_mode,
    leadAssignmentMode: row.lead_assignment_mode || undefined
  };
}

// Inverse of formatPriceValue: turns the Add/Edit Property forms' free-text
// price back into rupees for the API. Unparseable text is omitted (the forms
// validate it first, so that only happens for legacy values).
// Understands units ("85 Lakh", "1.91 Cr", "₹45,00,000"); see parseIndianPrice.
function parsePriceToValue(price?: string): number | undefined {
  if (!price) return undefined;
  return parseIndianPrice(price) ?? undefined;
}

export function mapApiResaleUnitToFrontend(row: ApiResaleUnitRow): ResaleUnit {
  return {
    id: row.id,
    property: row.property_name,
    builder: row.builder || "",
    location: row.location || "",
    price: row.price || "",
    description: row.description || "",
    listedBy: row.listed_by || ""
  };
}

const FOLLOWUP_STATUS_MAP: Record<string, FollowupCall["status"]> = { MISSED: "Missed", UPCOMING: "Upcoming", COMPLETED: "Completed" };
const FOLLOWUP_TYPE_MAP: Record<string, FollowupCall["type"]> = { CALLBACK: "Callback", MEETING: "Meeting", SITE_VISIT: "Site Visit" };

function mapApiFollowupToFrontend(row: ApiFollowupRow): FollowupCall {
  return {
    id: row.id,
    leadId: row.lead_id || undefined,
    date: toIsoDate(new Date(row.scheduled_at)),
    scheduledAt: row.scheduled_at,
    time: new Date(row.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase(),
    status: FOLLOWUP_STATUS_MAP[row.status] || "Upcoming",
    leadName: row.lead_name,
    phone: row.phone || "",
    type: FOLLOWUP_TYPE_MAP[row.call_type] || "Callback",
    assignedTo: row.assigned_to_name,
    dueNotifiedAt: row.due_notified_at || undefined,
    violationNotifiedAt: row.violation_notified_at || undefined
  };
}

// Exported (same convention as mapApiLeadToFrontendLead) so the HRMS page's
// server-paginated attendance table can map a fetched page's rows itself,
// the same way LeadDashboard.tsx does for apiListLeadsPage, instead of
// needing the full attendanceRecords array AppContext still bulk-loads for
// other consumers' simple derived counts.
export function mapApiAttendanceToFrontend(row: ApiAttendanceRow): AttendanceRecord {
  return {
    employeeName: row.employee_name,
    email: row.email,
    designation: row.designation || "",
    presentDays: Number(row.present_days),
    totalDays: Number(row.total_days),
    onTime: Number(row.on_time_days),
    late: Number(row.late_days)
  };
}

const CLAIM_STATUS_MAP: Record<string, ReimbursementClaim["status"]> = { PENDING: "Pending", PAID: "Paid", REJECTED: "Rejected" };

export function mapApiReimbursementToFrontend(row: ApiReimbursementRow): ReimbursementClaim {
  return {
    id: row.id,
    title: row.title,
    type: row.claim_type,
    amount: Number(row.amount),
    status: CLAIM_STATUS_MAP[row.status] || "Pending",
    date: row.claim_date.slice(0, 10),
    agentName: row.agent_name,
    notes: row.notes || undefined
  };
}

const INVOICE_STATUS_MAP: Record<string, Invoice["status"]> = { DRAFT: "Draft", PAID: "Paid", OVERDUE: "Overdue" };
const COLLECTION_STATUS_MAP: Record<string, NonNullable<Invoice["collectionStatus"]>> = {
  PENDING: "Pending", PARTIALLY_COLLECTED: "Partially Collected", COLLECTED: "Collected"
};

export function mapApiInvoiceToFrontend(row: ApiInvoiceRow): Invoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number || undefined,
    leadId: row.lead_id,
    clientName: row.client_name,
    baseAmount: Number(row.base_amount),
    cgst: Number(row.cgst),
    sgst: Number(row.sgst),
    totalAmount: Number(row.total_amount),
    status: INVOICE_STATUS_MAP[row.status] || "Draft",
    createdAt: row.created_at,
    dueDate: row.due_date.slice(0, 10),
    developerName: row.developer_name || undefined,
    projectName: row.project_name || undefined,
    unitNo: row.unit_no || undefined,
    unitDimension: row.unit_dimension || undefined,
    brokerageType: row.brokerage_type === "PERCENTAGE" ? "Percentage" : row.brokerage_type === "FLAT" ? "Flat" : undefined,
    brokerageRate: row.brokerage_rate || undefined,
    collectionStatus: COLLECTION_STATUS_MAP[row.collection_status] || "Pending",
    collectedAmount: Number(row.collected_amount)
  };
}

// Exported so NotificationBell can map its own server-fetched pages
// (apiListNotificationsPage) the same way AppContext's bulk load does — see
// LeadDashboard's equivalent use of mapApiLeadToFrontendLead.
export function mapApiNotificationToFrontend(row: ApiNotificationRow): Notification {
  return {
    id: row.id,
    system: row.system,
    category: row.category as NotificationCategory,
    title: row.title,
    message: row.message,
    timestamp: row.created_at,
    read: row.read,
    leadId: row.lead_id || undefined,
    link: row.link || undefined
  };
}

// Exported so the CRM/Admin calendar pages' server-range-fetched pages can
// map their own directly-fetched rows without duplicating this logic — same
// convention as mapApiLeadToFrontendLead above. Every other calendar
// consumer (HRMS/Finance pages, this file's own bulk load) still goes
// through the full-array AppContext load.
export function mapApiCalendarEventToFrontend(row: ApiCalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    system: row.system,
    type: row.event_type as CalendarEventType,
    title: row.title,
    date: row.event_date.slice(0, 10),
    time: row.event_time || undefined,
    description: row.description || undefined,
    leadId: row.lead_id || undefined,
    employeeNames: row.attendee_names.length > 0 ? row.attendee_names : undefined,
    createdBy: row.created_by_name || undefined,
    amount: row.amount ? Number(row.amount) : undefined
  };
}

const TIMESHEET_STATUS_MAP: Record<string, TimesheetLog["status"]> = {
  FULL_DAY: "Full Day", HALF_DAY: "Half Day", REGULARIZATION_PENDING: "Regularization Pending", REGULARIZED: "Regularized"
};

// Exported for the same reason as mapApiAttendanceToFrontend above — the
// HRMS page's server-paginated timesheet tables map each fetched page
// themselves rather than needing the full timesheets array.
export function mapApiTimesheetToFrontend(row: ApiTimesheetRow): TimesheetLog {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    date: row.work_date.slice(0, 10),
    punchIn: row.punch_in,
    punchOut: row.punch_out || undefined,
    punchInLat: row.punch_in_lat ? Number(row.punch_in_lat) : undefined,
    punchInLng: row.punch_in_lng ? Number(row.punch_in_lng) : undefined,
    durationHours: row.duration_hours ? Number(row.duration_hours) : undefined,
    status: TIMESHEET_STATUS_MAP[row.status] || "Half Day",
    regularizationRequest: row.regularization_id
      ? {
          requestedIn: row.requested_in!,
          requestedOut: row.requested_out!,
          reason: row.reason!,
          submittedAt: row.submitted_at!
        }
      : undefined
  };
}

function mapApiTenantSettingsToFrontend(row: ApiTenantSettings): TenantSettings {
  return {
    officeLat: Number(row.office_lat),
    officeLng: Number(row.office_lng),
    geofenceRadiusMeters: row.geofence_radius_meters,
    halfDayThresholdHours: Number(row.half_day_threshold_hours),
    gstRate: Number(row.gst_rate),
    invoiceDueDays: row.invoice_due_days
  };
}

function mapApiAdSpendToFrontend(row: ApiAdSpendRow): AdSpendRecord {
  return {
    id: row.id,
    platform: row.platform === "META" ? "Meta" : "Google",
    accountName: row.account_name,
    property: row.property_name || undefined,
    date: row.spend_date.slice(0, 10),
    spend: Number(row.spend),
    leadsGenerated: row.leads_generated,
    campaignStatus: row.campaign_status || undefined
  };
}

function mapApiAdLevelSpendToFrontend(row: ApiAdLevelSpendRow): AdLevelSpendRecord {
  return {
    platform: row.platform === "META" ? "Meta" : "Google",
    adId: row.ad_id,
    adName: row.ad_name,
    creativeName: row.creative_name || undefined,
    adType: row.ad_type || undefined,
    adSetName: row.ad_set_name,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    campaignStatus: row.campaign_status,
    date: row.spend_date.slice(0, 10),
    spend: Number(row.spend),
    leadsGenerated: row.leads_generated
  };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Subscription Configuration State - default to active subscription for easy demoing!
  const [adminSeats, setAdminSeats] = useState(1);
  const [financeSeats, setFinanceSeats] = useState(1);
  const [agentSeats, setAgentSeats] = useState(12);
  const [isPaid, setIsPaid] = useState(true);
  const [isProvisioned, setIsProvisioned] = useState(true);

  // Authentication & Users State
  const [users, setUsers] = useState<User[]>([]); // fetched from the real API — see loadAllRealData below
  
  // No more hardcoded pre-logged-in user — a real session (real login, or a
  // token restored from a previous session) is required. See `authLoading` /
  // the session-restore effect below and RequireAuth in dashboard/layout.tsx.
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeRole, setActiveRole] = useState<Role>("ADMIN");
  const [activeSystem, setActiveSystem] = useState<SystemType>("ADMIN");
  const [showLoginSplash, setShowLoginSplash] = useState(false);

  // Core Module States — all fetched from the real API now (see the
  // session-restore effect and loadAllRealData below). Empty until a real
  // session exists; nothing here falls back to mock data anymore.
  // Raw state holds EVERY lead regardless of source — mutations (reassign,
  // status update, KYC, create) must be able to find/update any lead no
  // matter where it came from. The public `leads` and `dataCallingLeads`
  // context values below are derived, mutually-exclusive views over this:
  // Data Calling is a separate cold-outreach pipeline (bulk-uploaded
  // contact lists) from the rest of the CRM's real, ad-driven leads, so a
  // bulk-uploaded lead must show on Data Calling and NOWHERE else — not in
  // the main Leads dashboard, not in Reports/Campaign Analytics totals.
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [resaleUnits, setResaleUnits] = useState<ResaleUnit[]>([]);
  const [followupCalls, setFollowupCalls] = useState<FollowupCall[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [reimbursements, setReimbursements] = useState<ReimbursementClaim[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetLog[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [pendingCallAttempt, setPendingCallAttempt] = useState<ApiCallAttemptRow | null>(null);
  const [adSpendRecords, setAdSpendRecords] = useState<AdSpendRecord[]>([]);
  const [adLevelSpendRecords, setAdLevelSpendRecords] = useState<AdLevelSpendRecord[]>([]);

  // True from the moment a session starts (fresh login or a restored one)
  // until loadAllRealData's first pass for it finishes. Login/session-restore
  // no longer block navigation on this (see loginWithTempPassword and the
  // mount effect below) — they set authLoading false and let the user into
  // the app as soon as their identity is known, with every domain list
  // still empty for a moment while it loads in the background. Pages can
  // read this to tell "still loading" apart from "genuinely no leads yet"
  // instead of flashing an empty state — real skeleton loading UI is the
  // next piece of work, this flag is what it hooks into.
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Real backend integration (Taskezy-Server) — every domain below is fetched
  // from the real database. Nothing in this file falls back to mock data.
  const loadAllRealData = async (role?: Role) => {
    setIsDataLoading(true);
    try {
      const [apiLeads, apiUsers, apiProperties, apiResaleUnits, apiFollowups, apiAttendance, apiReimbursements, apiInvoices, apiCalendarEvents, apiAdSpend, apiAdLevelSpend, apiTimesheets, apiTenantSettings] = await Promise.all([
        apiListAllLeads(),
        apiListUsers(),
        apiListProperties(),
        apiListResaleUnits(),
        apiListFollowups(),
        apiListAttendance(),
        apiListReimbursements(),
        apiListInvoices(),
        apiListCalendarEvents(),
        apiListAdSpend(),
        apiListAdLevelSpend(),
        apiListTimesheets(),
        apiGetTenantSettings()
      ]);
      setAllLeads(apiLeads.map(mapApiLeadToFrontendLead));
      setUsers(apiUsers.map(mapApiUserDirectoryEntryToFrontendUser));
      setProperties(apiProperties.map(mapApiPropertyToFrontend));
      setResaleUnits(apiResaleUnits.map(mapApiResaleUnitToFrontend));
      setFollowupCalls(apiFollowups.map(mapApiFollowupToFrontend));
      setAttendanceRecords(apiAttendance.map(mapApiAttendanceToFrontend));
      setReimbursements(apiReimbursements.map(mapApiReimbursementToFrontend));
      setInvoices(apiInvoices.map(mapApiInvoiceToFrontend));
      setCalendarEvents(apiCalendarEvents.map(mapApiCalendarEventToFrontend));
      setAdSpendRecords(apiAdSpend.map(mapApiAdSpendToFrontend));
      setAdLevelSpendRecords(apiAdLevelSpend.map(mapApiAdLevelSpendToFrontend));
      setTimesheets(apiTimesheets.map(mapApiTimesheetToFrontend));
      setTenantSettings(mapApiTenantSettingsToFrontend(apiTenantSettings));

      // /api/v1/meta/connections is ADMIN-only — only attempt it for admins,
      // other roles keep the default false rather than eating a guaranteed 403.
      if (role === "ADMIN") {
        try {
          const connections = await apiListMetaConnections();
          setMetaConnected(connections.some(c => c.status === "ACTIVE"));
        } catch {
          // Non-fatal — Connected Apps tab will still show real state on its own fetch.
        }
      }
    } catch (err) {
      // Server unreachable or session invalid. Nothing to fall back to
      // anymore — surfaced as empty lists in the UI, not fake data.
      console.warn("Could not load real data from the API:", err);
    } finally {
      setIsDataLoading(false);
    }
  };

  // Re-fetches just the ad-level rows (Campaign Deep Dive's Ad Set
  // Name/Ad creative Name/CPL columns) without reloading every other
  // domain — used to pick up new rows after a manual sync trigger.
  const refetchAdLevelSpend = async () => {
    const apiAdLevelSpend = await apiListAdLevelSpend();
    setAdLevelSpendRecords(apiAdLevelSpend.map(mapApiAdLevelSpendToFrontend));
  };

  // Admin CRM Data Calling's bulk Excel upload. The API only returns counts
  // (created/duplicates/skipped rows), not the created leads themselves, so
  // a full leads refetch afterward is what actually brings the new rows
  // into view — matches this file's optimistic-update-elsewhere/refetch-here
  // split, since there's no local lead object to optimistically construct
  // for rows the server assigned via Round Robin/Percentage.
  const bulkImportLeads = async (input: BulkImportLeadsApiInput): Promise<BulkImportLeadsApiResult> => {
    const result = await apiBulkImportLeads(input);
    if (result.created > 0) {
      const apiLeads = await apiListAllLeads();
      setAllLeads(apiLeads.map(mapApiLeadToFrontendLead));
    }
    return result;
  };

  // Wakes the real Meta/Google ad-level sync jobs early (Campaign Deep
  // Dive's Sync button) instead of waiting for their 6h interval. Does not
  // bypass either platform's real rate limits — it only starts checking
  // for new data sooner, so the caller should keep polling refetchAdLevelSpend
  // for a while afterward rather than expecting an instant result.
  const triggerAdSpendSync = async () => {
    return apiTriggerAdSpendSync();
  };

  // Fired by CallState's "callEnded" listener (lib/callTrigger.ts). Creates
  // the PENDING_FEEDBACK row immediately — before CallFeedbackGate even
  // renders — so the block survives a force-quit right after the call.
  const recordCallEnded = async (leadId: string, startedAt: string | undefined, durationSeconds: number) => {
    const attempt = await apiCreateCallAttempt({ leadId, channel: "CALL", startedAt, durationSeconds });
    setPendingCallAttempt(attempt);
  };

  // Fired when the agent returns to Taskezy after the WhatsApp button
  // opened wa.me (lib/callTrigger.ts's triggerLeadWhatsApp) — there's no
  // "message sent" signal to wait for, so this is the trigger itself, not
  // a confirmation of anything. CallFeedbackGate asks Yes/No from here.
  const recordWhatsAppOpened = async (leadId: string) => {
    const attempt = await apiCreateCallAttempt({ leadId, channel: "WHATSAPP" });
    setPendingCallAttempt(attempt);
  };

  const submitCallFeedback = async (outcome: string, notes: string) => {
    if (!pendingCallAttempt) return;
    await apiSubmitCallFeedback(pendingCallAttempt.id, { outcome, notes });
    setPendingCallAttempt(null);
  };

  // On mount: if a token survived a page refresh, restore the session and
  // pull all real data. If not (or the server is down), currentUser stays
  // null and RequireAuth (dashboard/layout.tsx) redirects to /auth/login.
  useEffect(() => {
    if (!isApiSessionActive()) {
      setAuthLoading(false);
      return;
    }
    apiGetMe()
      .then((apiUser) => {
        const mapped = mapApiUserToFrontendUser(apiUser);
        setCurrentUser(mapped);
        setActiveRole(mapped.role);
        setActiveSystem(getDefaultSystem(mapped));
        // authLoading gates RequireAuth's redirect-to-login check, not the
        // page's own data — clear it as soon as identity is confirmed so a
        // page refresh doesn't re-block the whole app behind the same full
        // fetch loadAllRealData does (that was the other place, besides
        // fresh login, this app-wide stall was coming from). The fetch
        // itself still runs, just in the background — see isDataLoading.
        setAuthLoading(false);
        loadAllRealData(mapped.role);
        // Re-shows CallFeedbackGate after a force-quit/relaunch mid-feedback
        // — not just within the same in-memory session. Native app only
        // (web never creates one of these rows in the first place).
        if (Capacitor.isNativePlatform()) {
          apiGetPendingCallAttempt()
            .then(setPendingCallAttempt)
            .catch((err) => console.warn("Could not check for a pending call-feedback gate:", err));
        }
      })
      .catch(() => {
        clearApiSession();
        setAuthLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connectivity & Edge Sync Simulation
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncQueue, setPendingSyncQueue] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  // Reflects whether any meta_connections row is ACTIVE — set on initial load
  // for ADMINs (see loadAllRealData) and refreshed after Connect/Disconnect.
  const [metaConnected, setMetaConnected] = useState(false);
  const [tenantSettings, setTenantSettings] = useState<TenantSettings | null>(null);

  const refreshMetaConnectionStatus = async () => {
    try {
      const connections = await apiListMetaConnections();
      setMetaConnected(connections.some(c => c.status === "ACTIVE"));
    } catch {
      // Non-admin or unreachable — leave metaConnected as-is.
    }
  };

  const updateTenantSettings = async (input: UpdateTenantSettingsInput): Promise<{ success: boolean; error?: string }> => {
    try {
      const updated = await apiUpdateTenantSettings(input);
      setTenantSettings(mapApiTenantSettingsToFrontend(updated));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof ApiRequestError ? err.message : "Could not save settings." };
    }
  };

  // Update online state event listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // One-time browser-autoplay unlock (see notificationSound.ts) — attaches
  // once on mount, independent of the SSE connection lifecycle below.
  useEffect(() => {
    return initNotificationSoundUnlock();
  }, []);

  // Bumped whenever the server says a lead changed (see the "leads-changed"
  // SSE listener below) — pages with their own server-paginated lead fetch
  // (LeadDashboard) list this in their fetch effect's deps to refetch their
  // current page live, without ever holding the full leads list themselves.
  const [leadsChangedSignal, setLeadsChangedSignal] = useState(0);
  const leadsChangedQueueRef = useRef<Set<string>>(new Set());
  const leadsChangedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerManualRefresh = () => {
    setLeadsChangedSignal((s) => s + 1);
    loadAllRealData(currentUser?.role);
  };

  // Live notifications (Meta leads, etc.) over Server-Sent Events — one
  // connection per session, reopened whenever the signed-in user changes.
  // Each connection attempt mints a fresh one-time ticket first (see
  // apiClient's buildNotificationStreamUrl comment) — a ticket is single-use,
  // so EventSource's own built-in auto-reconnect (which just re-opens the
  // *same* URL) would fail every time after the first drop. onerror below
  // closes the dead connection and reconnects manually with a new ticket
  // instead of relying on that native behaviour.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (cancelled) return;
      let ticket: string;
      try {
        ({ ticket } = await apiCreateNotificationStreamTicket());
      } catch {
        // Not signed in yet, or a transient failure — retry shortly rather
        // than leaving live notifications dead for the rest of the session.
        if (!cancelled) reconnectTimer = setTimeout(connect, 5000);
        return;
      }
      if (cancelled) return;

      source = new EventSource(buildNotificationStreamUrl(ticket));

      // Content-free: the payload is only { leadId }, never lead data. Pages
      // refetch their own page through the normal authorized API, which is
      // the only place access is decided — broadcasting data itself here
      // would mean re-deciding who-sees-what a second time, and any gap
      // between the two becomes a real leak. Queued + debounced so a bulk
      // import touching 100 leads causes one refetch, not 100.
      source.addEventListener("leads-changed", (event) => {
        const { leadId } = JSON.parse((event as MessageEvent).data) as { leadId: string };
        leadsChangedQueueRef.current.add(leadId);
        if (leadsChangedTimerRef.current) clearTimeout(leadsChangedTimerRef.current);
        leadsChangedTimerRef.current = setTimeout(() => {
          const ids = Array.from(leadsChangedQueueRef.current);
          leadsChangedQueueRef.current.clear();
          setLeadsChangedSignal((s) => s + 1);
          // Keep the full bulk-loaded array (Reports, etc.) live too —
          // refetch each changed lead; a 404 means deleted or no longer
          // visible to this user, so drop it rather than leave it stale.
          ids.forEach((id) => {
            apiGetLead(id)
              .then((row) => {
                const mapped = mapApiLeadToFrontendLead(row);
                setAllLeads((prev) =>
                  prev.some((l) => l.id === mapped.id) ? prev.map((l) => (l.id === mapped.id ? mapped : l)) : [mapped, ...prev]
                );
              })
              .catch(() => setAllLeads((prev) => prev.filter((l) => l.id !== id)));
          });
        }, 600);
      });

      source.addEventListener("notification", (event) => {
        const row = JSON.parse((event as MessageEvent).data) as ApiNotificationRow;
        const notif = mapApiNotificationToFrontend(row);
        setNotifications(prev => (prev.some(n => n.id === notif.id) ? prev : [notif, ...prev]));
        playNotificationSound(notif.category, notif.system);

        // The notification itself was real-time, but until now nothing made the
        // CRM's actual leads list (table, KPI counts) catch up — a new Meta
        // lead wouldn't appear there until a manual page refresh. Fetch just
        // that one lead and merge it in instead of a full reload.
        if (notif.category === "NEW_LEAD" && notif.leadId) {
          apiGetLead(notif.leadId)
            .then((leadRow) => {
              const mapped = mapApiLeadToFrontendLead(leadRow);
              setAllLeads(prev => (prev.some(l => l.id === mapped.id) ? prev : [mapped, ...prev]));
            })
            .catch((err) => console.warn("Could not fetch the new lead for live update:", err));
        }
      });
      source.onerror = () => {
        source?.close();
        source = null;
        if (!cancelled) reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [currentUser?.id]);

  // Notification actions
  const addNotification = (notification: Omit<Notification, "id" | "timestamp" | "read">) => {
    const notif: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      read: false
    };
    setNotifications(prev => [notif, ...prev]);
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev =>
      prev.flatMap(n => (n.id !== id ? [n] : isLeadActivity(n) ? [{ ...n, read: true }] : []))
    );
    if (isApiSessionActive() && isRealId(id)) {
      apiMarkNotificationRead(id).catch((err) => console.warn("Could not persist notification read-state to the database:", err));
    }
  };

  const markAllNotificationsRead = (system?: SystemType) => {
    setNotifications(prev =>
      prev.flatMap(n => (system && n.system !== system ? [n] : isLeadActivity(n) ? [{ ...n, read: true }] : []))
    );
    if (isApiSessionActive()) {
      apiMarkAllNotificationsRead(system).catch((err) => console.warn("Could not persist mark-all-read to the database:", err));
    }
  };

  // Throws if the server delete fails, so the caller can tell the user nothing was cleared.
  const clearNotifications = async (system?: SystemType) => {
    if (isApiSessionActive()) await apiClearNotifications(system);
    setNotifications(prev => prev.filter(n => system && n.system !== system));
  };

  // Calendar actions
  const addCalendarEvent = (event: Omit<CalendarEvent, "id">) => {
    const newEvent: CalendarEvent = {
      ...event,
      id: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    };
    setCalendarEvents(prev => [newEvent, ...prev]);

    if (isApiSessionActive()) {
      const attendeeUserIds = newEvent.employeeNames
        ?.map(name => users.find(u => u.name === name)?.id)
        .filter((id): id is string => Boolean(id));

      apiCreateCalendarEvent({
        system: newEvent.system,
        eventType: newEvent.type,
        title: newEvent.title,
        date: newEvent.date,
        time: newEvent.time,
        description: newEvent.description,
        leadId: newEvent.leadId && isRealId(newEvent.leadId) ? newEvent.leadId : undefined,
        amount: newEvent.amount,
        attendeeUserIds: attendeeUserIds?.length ? attendeeUserIds : undefined
      })
        .then((created) => {
          setCalendarEvents(prev => prev.map(e => (e.id === newEvent.id ? mapApiCalendarEventToFrontend(created) : e)));
        })
        .catch((err) => console.warn("Could not persist new calendar event to the database:", err));
    }
  };

  // Writes to followup_calls alongside calendar_events (see addCalendarEvent
  // call sites for SITE_VISIT/FOLLOWUP reminders) — the followup_calls table
  // used to only ever contain whatever was seeded, since nothing wrote to it.
  const addFollowupCall = (input: { scheduledAt: string; leadId?: string; leadName: string; phone?: string; callType: "CALLBACK" | "MEETING" | "SITE_VISIT"; assignedToName: string }) => {
    const assignee = users.find(u => u.name === input.assignedToName);
    if (!isApiSessionActive() || !assignee) return;
    apiCreateFollowup({
      scheduledAt: input.scheduledAt,
      leadId: input.leadId && isRealId(input.leadId) ? input.leadId : undefined,
      leadName: input.leadName,
      phone: input.phone,
      callType: input.callType,
      assignedToId: assignee.id
    })
      .then((created) => setFollowupCalls(prev => [...prev, mapApiFollowupToFrontend(created)]))
      .catch((err) => console.warn("Could not persist new follow-up to the database:", err));
  };

  const deleteCalendarEvent = (id: string) => {
    setCalendarEvents(prev => prev.filter(e => e.id !== id));
    if (isApiSessionActive() && isRealId(id)) {
      apiDeleteCalendarEvent(id).catch((err) => console.warn("Could not delete calendar event from the database:", err));
    }
  };

  // Dynamic Seat Changer
  const setSeats = (role: Role, count: number) => {
    if (count < 1) return;
    if (role === "ADMIN") setAdminSeats(count);
    else if (role === "FINANCE") setFinanceSeats(count);
    else if (role === "AGENT") setAgentSeats(count);
  };

  // Payment process simulation
  const processPayment = async () => {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        setIsPaid(true);
        resolve(true);
      }, 1500);
    });
  };

  // Zero-Touch Provisioning simulator
  const provisionTenant = async () => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setIsProvisioned(true);
        resolve();
      }, 2000);
    });
  };

  // Roster Password manager (Force Reset)
  const resetRosterPassword = (userId: string, newPass: string) => {
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        return { ...u, tempPassword: newPass, password_hash: newPass, passwordStatus: "TEMPORARY" };
      }
      return u;
    }));
    if (isApiSessionActive() && isRealId(userId)) {
      apiResetUserPassword(userId, newPass).catch((err) => console.warn("Could not persist password reset to the database:", err));
    }
  };

  // Admin Direct Member Editor
  const updateUserFields = async (
    userId: string,
    firstName: string,
    lastName: string,
    newPassword: string,
    designation: string,
    roleType: "Manager" | "Member",
    status: "ACTIVE" | "INACTIVE",
    managerId?: string | null
  ) => {
    if (isApiSessionActive() && isRealId(userId)) {
      await apiEditUser(userId, {
        firstName,
        lastName,
        designation,
        roleType: roleType === "Manager" ? "MANAGER" : "MEMBER",
        status,
        managerId: managerId !== undefined ? (managerId || null) : undefined
      });
      // Only when the admin typed a new one — a profile edit no longer
      // resets the password (it used to, to whatever was in the box).
      if (newPassword) await apiResetUserPassword(userId, newPassword);
    }
    const managerName = managerId ? users.find(u => u.id === managerId)?.name : undefined;
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        return {
          ...u,
          first_name: firstName,
          last_name: lastName,
          name: `${firstName} ${lastName}`.trim(),
          designation,
          role_type: roleType,
          status,
          ...(managerId !== undefined ? { managerId: managerId || undefined, managerName } : {}),
          updated_at: new Date().toISOString()
        };
      }
      return u;
    }));
  };

  // Login handler
  const loginWithTempPassword = async (
    email: string,
    pass: string
  ): Promise<{ user: User } | { user: null; errorType: "invalid_credentials" | "rate_limited" | "network" }> => {
    try {
      const apiUser = await apiLogin(email, pass);
      const mapped = mapApiUserToFrontendUser(apiUser);
      setCurrentUser(mapped);
      setActiveRole(mapped.role);
      setActiveSystem(getDefaultSystem(mapped));
      // Deliberately not awaited — the actual login (auth check + issuing a
      // token) is fast; it was this full fetch of every domain (leads,
      // users, properties, invoices, ...) that made "login" feel like it
      // took several seconds. The dashboard can render the moment identity
      // is known and hydrate as this resolves in the background instead of
      // blocking navigation on it (see isDataLoading above).
      loadAllRealData(mapped.role);
      setShowLoginSplash(true);
      return { user: mapped };
    } catch (err) {
      // A 401/403 from the API means the credentials really are wrong. A
      // 429 means the login endpoint's own rate limiter (10 attempts/15min)
      // kicked in — the server was reached and is fine, it's just refusing
      // further attempts for a while; that's a real, separate condition
      // from either "wrong password" or "server unreachable" and deserves
      // its own message rather than collapsing into one of the other two
      // (which is exactly what caused a rate-limited attempt to show
      // "Invalid email or password" — misleading, since the password may
      // well be correct). Anything else — the fetch itself failing
      // (network/CORS), or the API returning a 5xx — means the server was
      // unreachable, not that the password was wrong.
      const isBadCredentials = err instanceof ApiRequestError && (err.status === 401 || err.status === 403);
      const isRateLimited = err instanceof ApiRequestError && err.status === 429;
      if (!(err instanceof ApiRequestError)) {
        console.error("Login request failed (is Taskezy-Server running?):", err);
      }
      const errorType = isBadCredentials ? "invalid_credentials" : isRateLimited ? "rate_limited" : "network";
      return { user: null, errorType };
    }
  };

  const setCurrentUserPasswordActive = () => {
    if (!currentUser) return;
    setUsers(prev => prev.map(u => {
      if (u.id === currentUser.id) {
        const updated = { ...u, passwordStatus: "ACTIVE" as const };
        delete updated.tempPassword;
        return updated;
      }
      return u;
    }));
    setCurrentUser(prev => prev ? { ...prev, passwordStatus: "ACTIVE" } : null);
    setShowLoginSplash(true);
  };

  const logout = () => {
    setCurrentUser(null);
    if (isApiSessionActive()) {
      apiLogout().catch(() => {});
    }
  };

  const switchUserRole = (role: Role, userId?: string) => {
    setActiveRole(role);
    if (userId) {
      const matchingUser = users.find(u => u.id === userId);
      if (matchingUser) {
        setCurrentUser(matchingUser);
        setActiveSystem(getDefaultSystem(matchingUser));
      }
    } else {
      const matchingUser = users.find(u => u.role === role);
      if (matchingUser) {
        setCurrentUser(matchingUser);
        setActiveSystem(getDefaultSystem(matchingUser));
      }
    }
  };

  // CRM State Rules
  const addLead = (leadData: Omit<Lead, "id" | "status" | "kycVerified" | "logs">) => {
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(leadData.phone)) {
      return { success: false, error: "Validation Error: Lead must contain a valid 10-digit Indian mobile number." };
    }

    const isDuplicate = allLeads.some(l => l.phone === leadData.phone);
    if (isDuplicate) {
      return { success: false, error: `Compliance Violation: Lead with phone number +91-${leadData.phone} already exists in database partition.` };
    }

    const newLead: Lead = {
      ...leadData,
      id: `lead-${Date.now()}`,
      status: "New",
      kycVerified: false,
      assignedAt: new Date().toISOString(),
      logs: [{ timestamp: new Date().toISOString(), message: `Lead added manually. Assigned to ${leadData.assignedAgent}`, user: currentUser?.name || "System" }]
    };

    setAllLeads(prev => [newLead, ...prev]);
    addNotification({
      system: "CRM",
      category: "NEW_LEAD",
      title: "New Lead Captured",
      message: `${newLead.name} • ${newLead.property || "Unassigned Project"} • via ${newLead.source || newLead.campaign || "Manual Entry"}`,
      leadId: newLead.id
    });

    // Best-effort background persist to the real database. UI already
    // updated optimistically above — this doesn't block or re-render on
    // success, it only matters if it fails (logged, not surfaced) or if the
    // real API isn't running (silently skipped, stays mock-only).
    if (isApiSessionActive()) {
      const realAgent = users.find(u => u.name === newLead.assignedAgent);
      if (realAgent) {
        const realProperty = newLead.property ? properties.find(p => p.name === newLead.property) : undefined;
        apiCreateLead({
          name: newLead.name,
          phone: newLead.phone,
          email: newLead.email || undefined,
          source: newLead.source,
          campaign: newLead.campaign,
          propertyId: realProperty?.id,
          assignedAgentId: realAgent.id
        })
          .then((created) => {
            // Reconcile the optimistic mock id with the real database id so
            // later actions (status updates) on this lead can sync too.
            setAllLeads(prev => prev.map(l => (l.id === newLead.id ? mapApiLeadToFrontendLead(created) : l)));
          })
          .catch((err) => console.warn("Could not persist new lead to the database:", err));
      } else {
        console.warn(`Could not resolve a real user account for agent "${newLead.assignedAgent}" — lead saved locally only.`);
      }
    }

    return { success: true };
  };

  // CRM Directed Acyclic Graph Status Transition Checks
  const updateLeadStatus = (
    leadId: string,
    targetStatus: LeadStatus,
    dealValue?: number,
    kycDocName?: string,
    subStatus?: "Qualified" | "Not Qualified"
  ) => {
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) return { success: false, error: "Lead not found." };

    if (!lead.firstResponseAt) {
      lead.firstResponseAt = new Date().toISOString();
    }
    lead.logs.push({
      timestamp: new Date().toISOString(),
      message: `Status changed to "${targetStatus}"`,
      user: currentUser?.name || "System"
    });

    lead.status = targetStatus;
    // Sub-status only means anything while Connected — matches the backend
    // clearing it on any other status (leads.service.ts).
    lead.subStatus = targetStatus === "Connected" ? subStatus : undefined;
    // Data Calling's promotion rule: Connected + Qualified graduates a
    // bulk-uploaded lead out of the cold-outreach pipeline — updating
    // source here (not just on the server) makes it move immediately from
    // dataCallingLeads into leads (see the useMemo split below), instead of
    // waiting for the next full refetch.
    if (targetStatus === "Connected" && subStatus === "Qualified" && lead.source === "Bulk Upload") {
      lead.source = "Data";
    }
    if (targetStatus === "Booking Done" || targetStatus === "Booking Approved") {
      lead.dealValue = dealValue;
      lead.kycDocName = kycDocName;

      // One invoice per booking — skip if a status flip-flop (e.g. Booking
      // Done -> Approved -> Done again) already created one for this lead.
      if (!invoices.some(i => i.leadId === lead.id)) {
        const localInvoiceId = `inv-${Date.now()}`;
        setInvoices(prev => [...prev, {
          id: localInvoiceId,
          leadId: lead.id,
          clientName: lead.name,
          baseAmount: dealValue || 0,
          cgst: (dealValue || 0) * 0.09,
          sgst: (dealValue || 0) * 0.09,
          totalAmount: (dealValue || 0) * 1.18,
          status: "Draft",
          createdAt: new Date().toISOString(),
          dueDate: new Date(Date.now() + 86400000 * 15).toISOString(),
          projectName: lead.property
        }]);

        if (isApiSessionActive() && isRealLeadId(leadId)) {
          apiCreateInvoice({
            leadId,
            clientName: lead.name,
            baseAmount: dealValue || 0,
            projectName: lead.property
          })
            .then((created) => setInvoices(prev => prev.map(i => (i.id === localInvoiceId ? mapApiInvoiceToFrontend(created) : i))))
            .catch((err) => console.warn("Could not persist auto-generated invoice to the database:", err));
        }
      }

      addCalendarEvent({
        system: "CRM",
        type: "BOOKING",
        title: `Booking Finalized — ${lead.name}`,
        date: todayIso(),
        description: `${lead.property || "Property"} • Deal Value ₹${(dealValue || 0).toLocaleString("en-IN")}`,
        leadId: lead.id
      });
    } else if (targetStatus === "EOI Customers") {
      addCalendarEvent({
        system: "CRM",
        type: "EOI",
        title: `EOI Submitted — ${lead.name}`,
        date: todayIso(),
        description: `${lead.property || "Property"} • Expression of interest recorded.`,
        leadId: lead.id
      });
    }
    setAllLeads([...allLeads]);

    // Best-effort background persist — only for leads that actually exist in
    // the real database (real UUID ids); locally-only mock leads are skipped.
    if (isApiSessionActive() && isRealLeadId(leadId)) {
      const dbCode = frontendStatusToDbCode(targetStatus);
      if (dbCode) {
        apiUpdateLeadStatus(leadId, dbCode, dealValue, targetStatus === "Connected" ? subStatus : undefined).catch((err) =>
          console.warn("Could not persist status update to the database:", err)
        );
        // The server deletes this lead's activity alerts on a status update; drop live copies too.
        setNotifications(prev => prev.filter(n => !(n.leadId === leadId && isLeadActivity(n))));
      }
    }

    return { success: true };
  };

  // Reassigns a lead to a new agent and restarts its SLA clock (used to correct missed leads)
  // Saves to the server first and only then updates local state, so the UI
  // never shows a reassignment the server refused. Rejects on failure.
  const reassignLead = async (leadId: string, newAgent: string, note: string): Promise<void> => {
    if (isApiSessionActive() && isRealLeadId(leadId)) {
      const realAgent = users.find(u => u.name === newAgent);
      if (!realAgent) throw new Error(`No team member named "${newAgent}".`);
      await apiReassignLead(leadId, realAgent.id, note);
    }

    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) return;

    const previousAgent = lead.assignedAgent;
    lead.previousAgent = previousAgent;
    lead.assignedAgent = newAgent;
    lead.reassignedAt = new Date().toISOString();
    lead.assignedAt = new Date().toISOString();
    lead.firstResponseAt = undefined;
    lead.notes = note;
    lead.notesUpdatedAt = new Date().toISOString();
    lead.notesUpdatedBy = currentUser?.name;
    lead.logs.push({
      timestamp: new Date().toISOString(),
      message: `Reassigned to ${newAgent}. Note: ${note}`,
      user: currentUser?.name || "System"
    });
    setAllLeads([...allLeads]);

    addNotification({
      system: "CRM",
      category: "GENERAL",
      title: "Lead Reassigned",
      message: `${lead.name} moved from ${previousAgent} to ${newAgent}.`,
      leadId: lead.id
    });
  };

  const updateLeadNote = async (leadId: string, note: string): Promise<Lead | null> => {
    let updated: Lead | null = null;
    if (isApiSessionActive() && isRealLeadId(leadId)) {
      updated = mapApiLeadToFrontendLead(await apiUpdateLeadNote(leadId, note));
    }
    setAllLeads(prev => prev.map(l => (l.id === leadId
      ? (updated ? { ...l, ...updated } : {
          ...l,
          notes: note,
          notesUpdatedAt: new Date().toISOString(),
          notesUpdatedBy: currentUser?.name,
          logs: [...l.logs, { timestamp: new Date().toISOString(), message: `Note: ${note}`, user: currentUser?.name || "System" }]
        })
      : l)));
    return updated;
  };

  const connectMeta = async () => {
    setMetaConnected(true);
  };

  const disconnectMeta = () => {
    setMetaConnected(false);
  };

  // Add Property
  const addProperty = (propertyData: Omit<Property, "id" | "membersCount">) => {
    const newProp: Property = {
      ...propertyData,
      id: `prop-${Date.now()}`,
      membersCount: 0,
      createdAt: new Date().toISOString()
    };
    setProperties(prev => [...prev, newProp]);

    if (isApiSessionActive()) {
      apiCreateProperty({
        name: newProp.name,
        developer: newProp.developer,
        location: newProp.location,
        locality: newProp.locality,
        zone: newProp.zone,
        priceValue: parsePriceToValue(newProp.price),
        priceType: newProp.priceType === "Starting From" ? "STARTING_FROM" : "ABSOLUTE",
        propertyType: newProp.type,
        propertyStatus: newProp.propertyStatus,
        description: newProp.description,
        possessionDate: newProp.possessionDate,
        landParcel: newProp.landParcel,
        towers: newProp.towers,
        structure: newProp.structure,
        amenities: newProp.amenities,
        contactNumber: newProp.contactNumber,
        mapUrl: newProp.mapUrl,
        websiteUrl: newProp.websiteUrl,
        brochureUrl: newProp.brochureUrl,
        leadRegistrationUrl: newProp.leadRegistrationUrl,
        tags: newProp.tags,
        mediaFileNames: newProp.mediaFileNames,
        teamAssignmentMode: newProp.teamAssignmentMode,
        leadAssignmentMode: newProp.leadAssignmentMode
      })
        .then(async (created) => {
          let finalRow = created;
          if (newProp.teamAssignmentMode === "CUSTOM_MEMBERS" && newProp.assignedTeam && newProp.assignedTeam.length > 0) {
            finalRow = await apiSetPropertyTeamMembers(
              created.id,
              newProp.assignedTeam.map(m => ({ userId: m.userId, percentage: m.percentage }))
            );
          }
          setProperties(prev => prev.map(p => (p.id === newProp.id ? mapApiPropertyToFrontend(finalRow) : p)));
        })
        .catch((err) => console.warn("Could not persist new property to the database:", err));
    }
  };

  // Add Resale
  const addResaleUnit = (unitData: Omit<ResaleUnit, "id">) => {
    const newUnit: ResaleUnit = {
      ...unitData,
      id: `resale-${Date.now()}`
    };
    setResaleUnits(prev => [...prev, newUnit]);

    if (isApiSessionActive()) {
      apiCreateResaleUnit({
        propertyName: newUnit.property,
        builder: newUnit.builder || undefined,
        location: newUnit.location || undefined,
        price: newUnit.price || undefined,
        description: newUnit.description || undefined,
        listedBy: newUnit.listedBy || undefined
      })
        .then((created) => {
          setResaleUnits(prev => prev.map(u => (u.id === newUnit.id ? mapApiResaleUnitToFrontend(created) : u)));
        })
        .catch((err) => console.warn("Could not persist new resale unit to the database:", err));
    }
  };

  // Reimbursements
  const addReimbursementClaim = (claimData: Omit<ReimbursementClaim, "id" | "status" | "date">) => {
    const newClaim: ReimbursementClaim = {
      ...claimData,
      id: `claim-${Date.now()}`,
      status: "Pending",
      date: todayIso()
    };
    setReimbursements(prev => [newClaim, ...prev]);
    addNotification({
      system: "FINANCE",
      category: "CLAIM",
      title: "New Reimbursement Claim",
      message: `${newClaim.agentName} submitted "${newClaim.title}" • ₹${newClaim.amount.toLocaleString()}`,
      link: "/dashboard/finance?tab=reimbursements"
    });

    if (isApiSessionActive()) {
      apiCreateReimbursement({ title: newClaim.title, claimType: newClaim.type, amount: newClaim.amount, notes: newClaim.notes })
        .then((created) => {
          setReimbursements(prev => prev.map(c => (c.id === newClaim.id ? mapApiReimbursementToFrontend(created) : c)));
        })
        .catch((err) => console.warn("Could not persist new reimbursement claim to the database:", err));
    }
  };

  const approveClaim = (id: string) => {
    setReimbursements(prev => prev.map(c => c.id === id ? { ...c, status: "Paid" } : c));
    if (isApiSessionActive() && isRealId(id)) {
      apiApproveReimbursement(id).catch((err) => console.warn("Could not persist claim approval to the database:", err));
    }
  };

  const rejectClaim = (id: string) => {
    setReimbursements(prev => prev.map(c => c.id === id ? { ...c, status: "Rejected" } : c));
    if (isApiSessionActive() && isRealId(id)) {
      apiRejectReimbursement(id).catch((err) => console.warn("Could not persist claim rejection to the database:", err));
    }
  };

  // HRMS actions
  // Geofence enforcement is real and server-side now (tenant_settings-driven,
  // see Taskezy-Server) — this used to do its own (inaccurate, hardcoded)
  // client-side pre-check and optimistically show "success" before the real
  // API call resolved, which could tell a user they'd punched in while the
  // actual database write silently failed. Now genuinely async: the UI only
  // reflects what the server actually accepted.
  const punchIn = async (lat: number, lng: number): Promise<{ success: boolean; error?: string }> => {
    if (!isApiSessionActive()) {
      return { success: false, error: "You must be signed in to punch in." };
    }
    try {
      const created = await apiPunchIn(lat, lng);
      setTimesheets(prev => [mapApiTimesheetToFrontend(created), ...prev]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof ApiRequestError ? err.message : "Punch-in failed." };
    }
  };

  const punchOut = async (): Promise<{ success: boolean; error?: string }> => {
    const todayStr = todayIso();
    const active = timesheets.find(ts => ts.date === todayStr && !ts.punchOut);
    if (!active) return { success: false, error: "No active shift found to punch out." };

    if (!isApiSessionActive() || !isRealId(active.id)) {
      return { success: false, error: "You must be signed in to punch out." };
    }
    try {
      const updated = await apiPunchOut();
      setTimesheets(prev => prev.map(ts => (ts.id === active.id ? mapApiTimesheetToFrontend(updated) : ts)));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof ApiRequestError ? err.message : "Punch-out failed." };
    }
  };

  const submitRegularization = (timesheetId: string, reqIn: string, reqOut: string, reason: string) => {
    setTimesheets(prev => prev.map(ts => {
      if (ts.id === timesheetId) {
        return {
          ...ts,
          status: "Regularization Pending" as const,
          regularizationRequest: {
            requestedIn: `${ts.date}T${reqIn}:00.000Z`,
            requestedOut: `${ts.date}T${reqOut}:00.000Z`,
            reason,
            submittedAt: new Date().toISOString()
          }
        };
      }
      return ts;
    }));

    const ts = timesheets.find(t => t.id === timesheetId);
    addNotification({
      system: "HRMS",
      category: "REGULARIZATION",
      title: "Attendance Regularization Requested",
      message: `${ts?.userName || "An employee"} submitted a correction request: "${reason}"`,
      link: "/dashboard/hrms?tab=attendance"
    });

    if (isApiSessionActive() && isRealId(timesheetId) && ts) {
      const requestedIn = `${ts.date}T${reqIn}:00.000Z`;
      const requestedOut = `${ts.date}T${reqOut}:00.000Z`;
      apiSubmitRegularization(timesheetId, requestedIn, requestedOut, reason)
        .then((updated) => setTimesheets(prev => prev.map(t => (t.id === timesheetId ? mapApiTimesheetToFrontend(updated) : t))))
        .catch((err) => console.warn("Could not persist regularization request to the database:", err));
    }
  };

  const approveRegularization = (timesheetId: string) => {
    setTimesheets(prev => prev.map(ts => {
      if (ts.id === timesheetId && ts.regularizationRequest) {
        const reqIn = ts.regularizationRequest.requestedIn;
        const reqOut = ts.regularizationRequest.requestedOut;
        const hours = 9.0; // Simulated full day approval
        
        return {
          ...ts,
          punchIn: reqIn,
          punchOut: reqOut,
          durationHours: hours,
          status: "Regularized" as const,
          regularizationRequest: undefined
        };
      }
      return ts;
    }));

    if (isApiSessionActive() && isRealId(timesheetId)) {
      apiApproveRegularization(timesheetId)
        .then((updated) => setTimesheets(prev => prev.map(ts => (ts.id === timesheetId ? mapApiTimesheetToFrontend(updated) : ts))))
        .catch((err) => console.warn("Could not persist regularization approval to the database:", err));
    }
  };

  const rejectRegularization = (timesheetId: string) => {
    setTimesheets(prev => prev.map(ts => {
      if (ts.id === timesheetId) {
        return {
          ...ts,
          status: ts.durationHours && ts.durationHours >= 4.0 ? "Full Day" as const : "Half Day" as const,
          regularizationRequest: undefined
        };
      }
      return ts;
    }));

    if (isApiSessionActive() && isRealId(timesheetId)) {
      apiRejectRegularization(timesheetId)
        .then((updated) => setTimesheets(prev => prev.map(ts => (ts.id === timesheetId ? mapApiTimesheetToFrontend(updated) : ts))))
        .catch((err) => console.warn("Could not persist regularization rejection to the database:", err));
    }
  };

  // Finance actions
  const verifyKYC = (leadId: string) => {
    setAllLeads(prev => prev.map(l => l.id === leadId ? { ...l, kycVerified: true } : l));
    const lead = allLeads.find(l => l.id === leadId);
    addNotification({
      system: "FINANCE",
      category: "KYC",
      title: "KYC Document Verified",
      message: `${lead?.name || "Lead"}'s KYC document has been verified. Invoice generation unlocked.`,
      link: "/dashboard/finance?tab=billing"
    });

    if (isApiSessionActive() && isRealLeadId(leadId)) {
      apiVerifyLeadKyc(leadId).catch((err) => console.warn("Could not persist KYC verification to the database:", err));
    }
  };

  const addInvoice = (leadId: string, clientName: string, baseAmount: number, projectName?: string) => {
    // invoices.lead_id is NOT NULL in the schema — an invoice with no real lead can't be persisted.
    if (!allLeads.some(l => l.id === leadId)) {
      return { success: false, error: "Select a lead for this invoice." };
    }

    const localInvoiceId = `inv-${Date.now()}`;
    setInvoices(prev => [...prev, {
      id: localInvoiceId,
      leadId,
      clientName,
      baseAmount,
      cgst: baseAmount * 0.09,
      sgst: baseAmount * 0.09,
      totalAmount: baseAmount * 1.18,
      status: "Draft",
      createdAt: new Date().toISOString(),
      dueDate: new Date(Date.now() + 86400000 * 15).toISOString(),
      projectName
    }]);

    if (isApiSessionActive() && isRealLeadId(leadId)) {
      apiCreateInvoice({ leadId, clientName, baseAmount, projectName })
        .then((created) => setInvoices(prev => prev.map(i => (i.id === localInvoiceId ? mapApiInvoiceToFrontend(created) : i))))
        .catch((err) => console.warn("Could not persist new invoice to the database:", err));
    }

    return { success: true };
  };

  const generateInvoice = (invoiceId: string) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id === invoiceId) {
        const base = inv.baseAmount;
        const cgst = base * 0.09;
        const sgst = base * 0.09;
        const total = base + cgst + sgst;
        const invoiceNum = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        return {
          ...inv,
          invoiceNumber: invoiceNum,
          cgst: Number(cgst.toFixed(2)),
          sgst: Number(sgst.toFixed(2)),
          totalAmount: Number(total.toFixed(2)),
          status: "Paid",
          createdAt: new Date().toISOString()
        };
      }
      return inv;
    }));

    const inv = invoices.find(i => i.id === invoiceId);
    addNotification({
      system: "FINANCE",
      category: "INVOICE",
      title: "Invoice Generated",
      message: `Invoice for ${inv?.clientName || "client"} generated with 18% GST applied.`,
      link: "/dashboard/finance?tab=billing"
    });

    if (isApiSessionActive() && isRealId(invoiceId)) {
      apiGenerateInvoice(invoiceId)
        .then((updated) => setInvoices(prev => prev.map(i => (i.id === invoiceId ? mapApiInvoiceToFrontend(updated) : i))))
        .catch((err) => console.warn("Could not persist invoice generation to the database:", err));
    }
  };

  const markInvoicePaid = (invoiceId: string) => {
    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: "Paid" } : inv));
    if (isApiSessionActive() && isRealId(invoiceId)) {
      apiMarkInvoicePaid(invoiceId).catch((err) => console.warn("Could not persist invoice payment to the database:", err));
    }
  };

  // CRUD actions for Admin
  const EMPLOYMENT_TYPE_TO_API: Record<string, "FULL_TIME" | "FREELANCER" | "INTERN" | "AGENCY"> = {
    "FULL TIME": "FULL_TIME", FREELANCER: "FREELANCER", INTERN: "INTERN", AGENCY: "AGENCY"
  };

  // Added to the roster only once the server has created the account, so a
  // rejected one (invalid field, email already in use) never looks created.
  const addTeamMember = async (u: Omit<User, "id" | "created_at" | "updated_at">) => {
    if (!isApiSessionActive()) {
      const now = new Date().toISOString();
      setUsers(prev => [...prev, { ...u, id: `user-${Date.now()}`, passwordStatus: "ACTIVE", created_at: now, updated_at: now }]);
      return;
    }
    const created = await apiCreateUser({
      firstName: u.first_name || u.name,
      lastName: u.last_name || undefined,
      email: u.email,
      phoneNumber: u.phone_number || undefined,
      designation: u.designation,
      role: u.role,
      roleType: u.role_type === "Manager" ? "MANAGER" : u.role_type === "Member" ? "MEMBER" : undefined,
      employmentType: u.employment_type ? EMPLOYMENT_TYPE_TO_API[u.employment_type] : undefined,
      department: u.department,
      managerId: u.managerId,
      password: u.tempPassword || u.password_hash || ""
    });
    setUsers(prev => [...prev, mapApiUserDirectoryEntryToFrontendUser(created)]);
  };

  // Removed locally only once the server has deleted the user (and handed
  // their leads over), so a rejected delete never looks like it worked.
  const deleteTeamMember = async (id: string, handover?: { reassignTo: string[]; note: string }) => {
    let reassignedLeads = 0;
    if (isApiSessionActive() && isRealId(id)) {
      reassignedLeads = (await apiDeleteUser(id, handover)).reassignedLeads ?? 0;
    }
    // Their team members no longer report to anyone (the server cleared it too).
    setUsers(prev => prev
      .filter(u => u.id !== id)
      .map(u => (u.managerId === id ? { ...u, managerId: undefined, managerName: undefined } : u)));
    return { reassignedLeads };
  };

  const deleteLead = (id: string) => {
    setAllLeads(prev => prev.filter(l => l.id !== id));
    if (isApiSessionActive() && isRealLeadId(id)) {
      apiDeleteLead(id).catch((err) => console.warn("Could not delete lead from the database:", err));
    }
  };

  const removeLeadsLocally = (leadIds: string[]) => {
    const removed = new Set(leadIds);
    setAllLeads(prev => prev.filter(l => !removed.has(l.id)));
  };

  const editLead = (id: string, updatedFields: Partial<Lead>) => {
    setAllLeads(prev => prev.map(l => l.id === id ? { ...l, ...updatedFields } : l));
    if (isApiSessionActive() && isRealLeadId(id)) {
      apiEditLead(id, {
        name: updatedFields.name,
        email: updatedFields.email,
        source: updatedFields.source,
        campaign: updatedFields.campaign,
        leadScore: updatedFields.leadScore
      }).catch((err) => console.warn("Could not persist lead edit to the database:", err));
    }
  };

  const deleteProperty = (id: string) => {
    setProperties(prev => prev.filter(p => p.id !== id));
    if (isApiSessionActive() && isRealId(id)) {
      apiDeleteProperty(id).catch((err) => console.warn("Could not delete property from the database:", err));
    }
  };

  const editProperty = (id: string, updatedFields: Partial<Property>) => {
    setProperties(prev => prev.map(p => p.id === id ? { ...p, ...updatedFields } : p));
    if (isApiSessionActive() && isRealId(id)) {
      apiEditProperty(id, {
        name: updatedFields.name,
        developer: updatedFields.developer,
        location: updatedFields.location,
        locality: updatedFields.locality,
        zone: updatedFields.zone,
        priceValue: updatedFields.price !== undefined ? parsePriceToValue(updatedFields.price) : undefined,
        priceType: updatedFields.priceType ? (updatedFields.priceType === "Starting From" ? "STARTING_FROM" : "ABSOLUTE") : undefined,
        propertyType: updatedFields.type,
        propertyStatus: updatedFields.propertyStatus,
        description: updatedFields.description,
        possessionDate: updatedFields.possessionDate,
        landParcel: updatedFields.landParcel,
        towers: updatedFields.towers,
        structure: updatedFields.structure,
        amenities: updatedFields.amenities,
        contactNumber: updatedFields.contactNumber,
        mapUrl: updatedFields.mapUrl,
        websiteUrl: updatedFields.websiteUrl,
        brochureUrl: updatedFields.brochureUrl,
        leadRegistrationUrl: updatedFields.leadRegistrationUrl,
        tags: updatedFields.tags,
        mediaFileNames: updatedFields.mediaFileNames,
        teamAssignmentMode: updatedFields.teamAssignmentMode,
        leadAssignmentMode: updatedFields.leadAssignmentMode
      }).catch((err) => console.warn("Could not persist property edit to the database:", err));

      if (updatedFields.assignedTeam !== undefined) {
        apiSetPropertyTeamMembers(
          id,
          updatedFields.assignedTeam.map(m => ({ userId: m.userId, percentage: m.percentage }))
        )
          .then((updated) => setProperties(prev => prev.map(p => (p.id === id ? mapApiPropertyToFrontend(updated) : p))))
          .catch((err) => console.warn("Could not persist property team assignment to the database:", err));
      }
    }
  };

  const deleteInvoice = (id: string) => {
    setInvoices(prev => prev.filter(i => i.id !== id));
    if (isApiSessionActive() && isRealId(id)) {
      apiDeleteInvoice(id).catch((err) => console.warn("Could not delete invoice from the database:", err));
    }
  };

  const deleteClaim = (id: string) => {
    setReimbursements(prev => prev.filter(c => c.id !== id));
    if (isApiSessionActive() && isRealId(id)) {
      apiDeleteReimbursement(id).catch((err) => console.warn("Could not delete claim from the database:", err));
    }
  };

  // Connection Manager
  const setOnlineStatus = (status: boolean) => {
    setIsOnline(status);
  };

  const triggerSync = async () => {
    if (pendingSyncQueue.length === 0) return;
    setIsSyncing(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setPendingSyncQueue([]);
    setIsSyncing(false);
  };

  // Data Calling (bulk-uploaded cold-outreach contact lists) is a separate
  // pipeline from the rest of the CRM's real, ad-driven leads. A lead still
  // sitting untouched (source "Bulk Upload") shows ONLY on Data Calling —
  // everywhere else (Leads dashboard, Reports, Campaign Analytics totals,
  // etc.) shows everything BUT those. Once a Data Calling lead is promoted
  // (Connected + Qualified — see leads.service.ts, source flips to "Data"),
  // it starts showing in the main CRM's `leads` too, but it does NOT
  // disappear from Data Calling's own Qualified Leads list — an admin
  // working that page needs to see which of their uploads actually
  // converted, drill into it, etc. `subSource` (the purchased-dataset
  // label, e.g. "Kashmiri Data") is set once at upload time and never
  // cleared, including through promotion, so "has a subSource" is the
  // stable "this lead came from Data Calling" signal — unlike `source`,
  // which is deliberately allowed to change. Every other page in the app
  // already just destructures `leads` from context, so this one split is
  // the only place that needs to know about any of this.
  const leads = useMemo(() => allLeads.filter(l => l.source !== "Bulk Upload"), [allLeads]);
  const dataCallingLeads = useMemo(() => allLeads.filter(l => !!l.subSource), [allLeads]);

  return (
    <AppContext.Provider
      value={{
        adminSeats,
        financeSeats,
        agentSeats,
        isPaid,
        isProvisioned,
        users,
        currentUser,
        authLoading,
        isDataLoading,
        leadsChangedSignal,
        triggerManualRefresh,
        activeRole,
        activeSystem,
        showLoginSplash,
        setShowLoginSplash,
        setActiveSystem,
        leads,
        dataCallingLeads,
        properties,
        resaleUnits,
        followupCalls,
        attendanceRecords,
        reimbursements,
        timesheets,
        invoices,
        notifications,
        calendarEvents,
        pendingCallAttempt,
        recordCallEnded,
        recordWhatsAppOpened,
        submitCallFeedback,
        adSpendRecords,
        adLevelSpendRecords,
        refetchAdLevelSpend,
        triggerAdSpendSync,
        bulkImportLeads,
        isOnline,
        pendingSyncCount: pendingSyncQueue.length,
        isSyncing,
        metaConnected,
        refreshMetaConnectionStatus,
        tenantSettings,
        updateTenantSettings,
        setSeats,
        processPayment,
        provisionTenant,
        resetRosterPassword,
        updateUserFields,
        setCurrentUserPasswordActive,
        loginWithTempPassword,
        logout,
        switchUserRole,
        addLead,
        updateLeadStatus,
        reassignLead,
        updateLeadNote,
        connectMeta,
        disconnectMeta,
        addProperty,
        addResaleUnit,
        addReimbursementClaim,
        approveClaim,
        rejectClaim,
        punchIn,
        punchOut,
        submitRegularization,
        approveRegularization,
        rejectRegularization,
        verifyKYC,
        addInvoice,
        generateInvoice,
        markInvoicePaid,
        addTeamMember,
        deleteTeamMember,
        deleteLead,
        removeLeadsLocally,
        editLead,
        deleteProperty,
        editProperty,
        deleteInvoice,
        deleteClaim,
        setOnlineStatus,
        triggerSync,
        addNotification,
        markNotificationRead,
        markAllNotificationsRead,
        clearNotifications,
        addCalendarEvent,
        addFollowupCall,
        deleteCalendarEvent
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
