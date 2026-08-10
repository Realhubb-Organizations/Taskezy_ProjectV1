"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  apiLogin,
  apiLogout,
  apiGetMe,
  apiListAllLeads,
  apiGetLead,
  apiCreateLead,
  apiUpdateLeadStatus,
  apiEditLead,
  apiReassignLead,
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
  apiListNotifications,
  getNotificationStreamUrl,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  apiListCalendarEvents,
  apiCreateCalendarEvent,
  apiDeleteCalendarEvent,
  apiListAdSpend,
  apiListMetaConnections,
  apiSetPropertyTeamMembers,
  apiListTimesheets,
  apiPunchIn,
  apiPunchOut,
  apiSubmitRegularization,
  apiApproveRegularization,
  apiRejectRegularization,
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
  ApiTimesheetRow,
  ApiRequestError
} from "@/lib/apiClient";
import { dbCodeToFrontendStatus, frontendStatusToDbCode, isRealLeadId, isRealId } from "@/lib/leadStatusMapping";

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
  logs: LeadLog[];
  source?: string;
  createdAtStr?: string;
  campaign?: string;
  metaPageName?: string; // which connected Meta Page this lead came in through
  metaFormId?: string; // which Lead Ad Form on that Page
  property?: string;
  leadScore?: number;

  // SLA / missed-lead tracking (report parameter: missed = no status update within 20 min of assignment)
  assignedAt?: string; // ISO — when the lead was (last) assigned to its current agent
  firstResponseAt?: string; // ISO — first time status was changed away from the initial state
  reassignedAt?: string; // ISO — set when the lead was moved to a different agent
  previousAgent?: string; // agent the lead was reassigned away from
}

export interface AdSpendRecord {
  id: string;
  platform: "Meta" | "Google";
  accountName: string;
  property?: string;
  date: string; // YYYY-MM-DD
  spend: number;
  leadsGenerated: number;
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
  date: string; // YYYY-MM-DD, for report date-range filtering
  time: string;
  status: "Missed" | "Upcoming" | "Completed";
  leadName: string;
  phone: string;
  type: "Callback" | "Meeting" | "Site Visit";
  assignedTo: string;
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
  | "GENERAL";

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
  activeRole: Role; // For easy switcher
  activeSystem: SystemType;
  
  // App Modules Data
  leads: Lead[];
  properties: Property[];
  resaleUnits: ResaleUnit[];
  followupCalls: FollowupCall[];
  attendanceRecords: AttendanceRecord[];
  reimbursements: ReimbursementClaim[];
  timesheets: TimesheetLog[];
  invoices: Invoice[];
  notifications: Notification[];
  calendarEvents: CalendarEvent[];
  adSpendRecords: AdSpendRecord[];

  // System State
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  metaConnected: boolean;
}

interface AppActions {
  refreshMetaConnectionStatus: () => Promise<void>;
  // SaaS actions
  setSeats: (role: Role, count: number) => void;
  processPayment: () => Promise<boolean>;
  provisionTenant: () => Promise<void>;
  resetRosterPassword: (userId: string, newPass: string) => void;
  updateUserFields: (
    userId: string,
    firstName: string,
    lastName: string,
    passwordHash: string,
    designation: string,
    roleType: "Manager" | "Member",
    status: "ACTIVE" | "INACTIVE",
    managerId?: string | null
  ) => void;
  setCurrentUserPasswordActive: () => void;
  // Now async: tries the real API server first (Taskezy-Server) and falls back to
  // local mock credentials only if the server is unreachable — see the implementation.
  loginWithTempPassword: (email: string, pass: string) => Promise<User | null>;
  logout: () => void;
  switchUserRole: (role: Role, userId?: string) => void;
  setActiveSystem: (system: SystemType) => void;

  // CRM actions
  addLead: (lead: Omit<Lead, "id" | "status" | "kycVerified" | "logs">) => { success: boolean; error?: string };
  updateLeadStatus: (leadId: string, status: LeadStatus, dealValue?: number, kycDocName?: string) => { success: boolean; error?: string };
  reassignLead: (leadId: string, newAgent: string) => void;
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
  punchIn: (lat: number, lng: number) => { success: boolean; error?: string };
  punchOut: () => { success: boolean; error?: string };
  submitRegularization: (timesheetId: string, requestedIn: string, requestedOut: string, reason: string) => void;
  approveRegularization: (timesheetId: string) => void;
  rejectRegularization: (timesheetId: string) => void;

  // Finance actions
  verifyKYC: (leadId: string) => void;
  addInvoice: (leadId: string, clientName: string, baseAmount: number, projectName?: string) => { success: boolean; error?: string };
  generateInvoice: (invoiceId: string) => void;
  markInvoicePaid: (invoiceId: string) => void;

  // CRUD actions for Admin
  addTeamMember: (user: Omit<User, "id" | "created_at" | "updated_at">) => void;
  deleteTeamMember: (userId: string) => void;
  deleteLead: (leadId: string) => void;
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

function mapApiLeadToFrontendLead(row: ApiLeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || "",
    status: dbCodeToFrontendStatus(row.status_code),
    dealValue: row.deal_value ? Number(row.deal_value) : undefined,
    kycVerified: false, // not included in the leads list endpoint yet
    assignedAgent: row.assigned_agent_name,
    logs: row.logs.map(l => ({ message: l.message, timestamp: l.timestamp, user: l.user })),
    source: row.source || undefined,
    campaign: row.campaign || undefined,
    metaPageName: row.meta_page_name || undefined,
    metaFormId: row.meta_form_id || undefined,
    property: row.property_name || undefined,
    leadScore: row.lead_score ?? undefined,
    assignedAt: row.assigned_at || undefined,
    firstResponseAt: row.first_response_at || undefined,
    createdAtStr: row.created_at
  };
}

function mapApiUserDirectoryEntryToFrontendUser(row: ApiUserDirectoryEntry): User {
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

function formatPriceValue(value: string | null, priceType: string | null): string | undefined {
  if (!value) return undefined;
  const cr = Number(value) / 10000000;
  const formatted = `₹${cr.toFixed(2)} Cr`;
  return priceType === "STARTING_FROM" ? `${formatted}+` : formatted;
}

function mapApiPropertyToFrontend(row: ApiPropertyRow): Property {
  return {
    id: row.id,
    name: row.name,
    developer: row.developer,
    location: row.location,
    locality: row.locality || undefined,
    zone: row.zone || undefined,
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

// Inverse of formatPriceValue below — the Add/Edit Property forms only ever
// collect a free-text price string (e.g. "1.5" meaning ₹1.5 Cr), so this
// pulls the first number out of it to reconstruct a raw rupee value for the
// API. Best-effort only: if nothing numeric is found, priceValue is omitted
// and the property still saves, just without a listed price server-side.
function parsePriceToValue(price?: string): number | undefined {
  if (!price) return undefined;
  const match = price.match(/[\d.]+/);
  if (!match) return undefined;
  const crores = Number(match[0]);
  return Number.isFinite(crores) ? crores * 10000000 : undefined;
}

function mapApiResaleUnitToFrontend(row: ApiResaleUnitRow): ResaleUnit {
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
    date: row.scheduled_at.split("T")[0],
    time: new Date(row.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase(),
    status: FOLLOWUP_STATUS_MAP[row.status] || "Upcoming",
    leadName: row.lead_name,
    phone: row.phone || "",
    type: FOLLOWUP_TYPE_MAP[row.call_type] || "Callback",
    assignedTo: row.assigned_to_name
  };
}

function mapApiAttendanceToFrontend(row: ApiAttendanceRow): AttendanceRecord {
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

function mapApiReimbursementToFrontend(row: ApiReimbursementRow): ReimbursementClaim {
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

function mapApiInvoiceToFrontend(row: ApiInvoiceRow): Invoice {
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

function mapApiNotificationToFrontend(row: ApiNotificationRow): Notification {
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

function mapApiCalendarEventToFrontend(row: ApiCalendarEventRow): CalendarEvent {
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

function mapApiTimesheetToFrontend(row: ApiTimesheetRow): TimesheetLog {
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

function mapApiAdSpendToFrontend(row: ApiAdSpendRow): AdSpendRecord {
  return {
    id: row.id,
    platform: row.platform === "META" ? "Meta" : "Google",
    accountName: row.account_name,
    property: row.property_name || undefined,
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

  // Core Module States — all fetched from the real API now (see the
  // session-restore effect and loadAllRealData below). Empty until a real
  // session exists; nothing here falls back to mock data anymore.
  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [resaleUnits, setResaleUnits] = useState<ResaleUnit[]>([]);
  const [followupCalls, setFollowupCalls] = useState<FollowupCall[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [reimbursements, setReimbursements] = useState<ReimbursementClaim[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetLog[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [adSpendRecords, setAdSpendRecords] = useState<AdSpendRecord[]>([]);

  // Real backend integration (Taskezy-Server) — every domain below is fetched
  // from the real database. Nothing in this file falls back to mock data.
  const loadAllRealData = async (role?: Role) => {
    try {
      const [apiLeads, apiUsers, apiProperties, apiResaleUnits, apiFollowups, apiAttendance, apiReimbursements, apiInvoices, apiNotifications, apiCalendarEvents, apiAdSpend, apiTimesheets] = await Promise.all([
        apiListAllLeads(),
        apiListUsers(),
        apiListProperties(),
        apiListResaleUnits(),
        apiListFollowups(),
        apiListAttendance(),
        apiListReimbursements(),
        apiListInvoices(),
        apiListNotifications(),
        apiListCalendarEvents(),
        apiListAdSpend(),
        apiListTimesheets()
      ]);
      setLeads(apiLeads.map(mapApiLeadToFrontendLead));
      setUsers(apiUsers.map(mapApiUserDirectoryEntryToFrontendUser));
      setProperties(apiProperties.map(mapApiPropertyToFrontend));
      setResaleUnits(apiResaleUnits.map(mapApiResaleUnitToFrontend));
      setFollowupCalls(apiFollowups.map(mapApiFollowupToFrontend));
      setAttendanceRecords(apiAttendance.map(mapApiAttendanceToFrontend));
      setReimbursements(apiReimbursements.map(mapApiReimbursementToFrontend));
      setInvoices(apiInvoices.map(mapApiInvoiceToFrontend));
      setNotifications(apiNotifications.map(mapApiNotificationToFrontend));
      setCalendarEvents(apiCalendarEvents.map(mapApiCalendarEventToFrontend));
      setAdSpendRecords(apiAdSpend.map(mapApiAdSpendToFrontend));
      setTimesheets(apiTimesheets.map(mapApiTimesheetToFrontend));

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
    }
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
      .then(async (apiUser) => {
        const mapped = mapApiUserToFrontendUser(apiUser);
        setCurrentUser(mapped);
        setActiveRole(mapped.role);
        setActiveSystem(getDefaultSystem(mapped));
        await loadAllRealData(mapped.role);
      })
      .catch(() => clearApiSession())
      .finally(() => setAuthLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connectivity & Edge Sync Simulation
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncQueue, setPendingSyncQueue] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  // Reflects whether any meta_connections row is ACTIVE — set on initial load
  // for ADMINs (see loadAllRealData) and refreshed after Connect/Disconnect.
  const [metaConnected, setMetaConnected] = useState(false);

  const refreshMetaConnectionStatus = async () => {
    try {
      const connections = await apiListMetaConnections();
      setMetaConnected(connections.some(c => c.status === "ACTIVE"));
    } catch {
      // Non-admin or unreachable — leave metaConnected as-is.
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

  // Live notifications (Meta leads, etc.) over Server-Sent Events — one
  // connection per session, reopened whenever the signed-in user changes.
  useEffect(() => {
    if (!currentUser) return;
    const url = getNotificationStreamUrl();
    if (!url) return;

    const source = new EventSource(url);
    source.addEventListener("notification", (event) => {
      const row = JSON.parse((event as MessageEvent).data) as ApiNotificationRow;
      const notif = mapApiNotificationToFrontend(row);
      setNotifications(prev => (prev.some(n => n.id === notif.id) ? prev : [notif, ...prev]));

      // The notification itself was real-time, but until now nothing made the
      // CRM's actual leads list (table, KPI counts) catch up — a new Meta
      // lead wouldn't appear there until a manual page refresh. Fetch just
      // that one lead and merge it in instead of a full reload.
      if (notif.category === "NEW_LEAD" && notif.leadId) {
        apiGetLead(notif.leadId)
          .then((leadRow) => {
            const mapped = mapApiLeadToFrontendLead(leadRow);
            setLeads(prev => (prev.some(l => l.id === mapped.id) ? prev : [mapped, ...prev]));
          })
          .catch((err) => console.warn("Could not fetch the new lead for live update:", err));
      }
    });
    // EventSource auto-reconnects on transient errors — nothing to do here
    // beyond not letting a stray error tear down the app.
    source.onerror = () => {};

    return () => source.close();
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
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    if (isApiSessionActive() && isRealId(id)) {
      apiMarkNotificationRead(id).catch((err) => console.warn("Could not persist notification read-state to the database:", err));
    }
  };

  const markAllNotificationsRead = (system?: SystemType) => {
    setNotifications(prev => prev.map(n => (!system || n.system === system ? { ...n, read: true } : n)));
    if (isApiSessionActive()) {
      apiMarkAllNotificationsRead(system).catch((err) => console.warn("Could not persist mark-all-read to the database:", err));
    }
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
  const updateUserFields = (
    userId: string,
    firstName: string,
    lastName: string,
    passwordHash: string,
    designation: string,
    roleType: "Manager" | "Member",
    status: "ACTIVE" | "INACTIVE",
    managerId?: string | null
  ) => {
    const managerName = managerId ? users.find(u => u.id === managerId)?.name : undefined;
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        return {
          ...u,
          first_name: firstName,
          last_name: lastName,
          name: `${firstName} ${lastName}`,
          password_hash: passwordHash,
          tempPassword: passwordHash,
          designation,
          role_type: roleType,
          status,
          ...(managerId !== undefined ? { managerId: managerId || undefined, managerName } : {}),
          updated_at: new Date().toISOString()
        };
      }
      return u;
    }));

    if (isApiSessionActive() && isRealId(userId)) {
      apiEditUser(userId, {
        firstName,
        lastName,
        designation,
        roleType: roleType === "Manager" ? "MANAGER" : "MEMBER",
        status,
        managerId: managerId !== undefined ? (managerId || null) : undefined
      }).catch((err) => console.warn("Could not persist user edit to the database:", err));
      // passwordHash here is really a plaintext password typed by the admin —
      // resetting it goes through the dedicated password endpoint, not the
      // profile-fields PATCH (see users.routes.ts).
      apiResetUserPassword(userId, passwordHash).catch((err) => console.warn("Could not persist password reset to the database:", err));
    }
  };

  // Login handler
  const loginWithTempPassword = async (email: string, pass: string): Promise<User | null> => {
    try {
      const apiUser = await apiLogin(email, pass);
      const mapped = mapApiUserToFrontendUser(apiUser);
      setCurrentUser(mapped);
      setActiveRole(mapped.role);
      setActiveSystem(getDefaultSystem(mapped));
      await loadAllRealData(mapped.role);
      return mapped;
    } catch (err) {
      // Any failure — bad credentials (401), inactive account, or the API
      // server being unreachable — is a failed login. No mock fallback.
      if (!(err instanceof ApiRequestError)) {
        console.error("Login request failed (is Taskezy-Server running?):", err);
      }
      return null;
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

    const isDuplicate = leads.some(l => l.phone === leadData.phone);
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

    setLeads(prev => [newLead, ...prev]);
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
        apiCreateLead({
          name: newLead.name,
          phone: newLead.phone,
          email: newLead.email || undefined,
          source: newLead.source,
          campaign: newLead.campaign,
          assignedAgentId: realAgent.id
        })
          .then((created) => {
            // Reconcile the optimistic mock id with the real database id so
            // later actions (status updates) on this lead can sync too.
            setLeads(prev => prev.map(l => (l.id === newLead.id ? mapApiLeadToFrontendLead(created) : l)));
          })
          .catch((err) => console.warn("Could not persist new lead to the database:", err));
      } else {
        console.warn(`Could not resolve a real user account for agent "${newLead.assignedAgent}" — lead saved locally only.`);
      }
    }

    return { success: true };
  };

  // CRM Directed Acyclic Graph Status Transition Checks
  const updateLeadStatus = (leadId: string, targetStatus: LeadStatus, dealValue?: number, kycDocName?: string) => {
    const lead = leads.find(l => l.id === leadId);
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
        date: new Date().toISOString().split("T")[0],
        description: `${lead.property || "Property"} • Deal Value ₹${(dealValue || 0).toLocaleString("en-IN")}`,
        leadId: lead.id
      });
    } else if (targetStatus === "EOI Customers") {
      addCalendarEvent({
        system: "CRM",
        type: "EOI",
        title: `EOI Submitted — ${lead.name}`,
        date: new Date().toISOString().split("T")[0],
        description: `${lead.property || "Property"} • Expression of interest recorded.`,
        leadId: lead.id
      });
    }
    setLeads([...leads]);

    // Best-effort background persist — only for leads that actually exist in
    // the real database (real UUID ids); locally-only mock leads are skipped.
    if (isApiSessionActive() && isRealLeadId(leadId)) {
      const dbCode = frontendStatusToDbCode(targetStatus);
      if (dbCode) {
        apiUpdateLeadStatus(leadId, dbCode, dealValue).catch((err) =>
          console.warn("Could not persist status update to the database:", err)
        );
      }
    }

    return { success: true };
  };

  // Reassigns a lead to a new agent and restarts its SLA clock (used to correct missed leads)
  const reassignLead = (leadId: string, newAgent: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const previousAgent = lead.assignedAgent;
    lead.previousAgent = previousAgent;
    lead.assignedAgent = newAgent;
    lead.reassignedAt = new Date().toISOString();
    lead.assignedAt = new Date().toISOString();
    lead.firstResponseAt = undefined;
    lead.logs.push({
      timestamp: new Date().toISOString(),
      message: `Reassigned from ${previousAgent} to ${newAgent}`,
      user: currentUser?.name || "System"
    });
    setLeads([...leads]);

    addNotification({
      system: "CRM",
      category: "GENERAL",
      title: "Lead Reassigned",
      message: `${lead.name} moved from ${previousAgent} to ${newAgent}.`,
      leadId: lead.id
    });

    if (isApiSessionActive() && isRealLeadId(leadId)) {
      const realAgent = users.find(u => u.name === newAgent);
      if (realAgent) {
        apiReassignLead(leadId, realAgent.id).catch((err) =>
          console.warn("Could not persist lead reassignment to the database:", err)
        );
      }
    }
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
      membersCount: 0
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
      date: new Date().toISOString().split("T")[0]
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
  const punchIn = (lat: number, lng: number) => {
    const centralLat = 19.0760;
    const centralLng = 72.8777;
    const distance = Math.sqrt(Math.pow(lat - centralLat, 2) + Math.pow(lng - centralLng, 2));

    if (distance > 0.15) {
      return { success: false, error: `GPS Telemetry Check Failed: Coordinates [${lat.toFixed(4)}, ${lng.toFixed(4)}] fall outside geofence perimeter.` };
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const newLog: TimesheetLog = {
      id: `ts-${Date.now()}`,
      userId: currentUser?.id || "user-agent",
      userName: currentUser?.name || "Amit Sharma",
      date: todayStr,
      punchIn: new Date().toISOString(),
      punchInLat: lat,
      punchInLng: lng,
      status: "Half Day"
    };

    setTimesheets(prev => [newLog, ...prev]);

    if (isApiSessionActive()) {
      apiPunchIn(lat, lng)
        .then((created) => {
          setTimesheets(prev => prev.map(ts => (ts.id === newLog.id ? mapApiTimesheetToFrontend(created) : ts)));
        })
        .catch((err) => console.warn("Could not persist punch-in to the database:", err));
    }

    return { success: true };
  };

  const punchOut = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const active = timesheets.find(ts => ts.date === todayStr && !ts.punchOut);
    if (!active) return { success: false, error: "No active shift found to punch out." };

    setTimesheets(prev => prev.map(ts => {
      if (ts.id === active.id) {
        const outTime = new Date().toISOString();
        const diffMs = new Date(outTime).getTime() - new Date(ts.punchIn).getTime();
        const hours = Number((diffMs / 3600000).toFixed(2));
        
        return {
          ...ts,
          punchOut: outTime,
          durationHours: hours,
          status: hours >= 4.0 ? "Full Day" : "Half Day"
        };
      }
      return ts;
    }));

    if (isApiSessionActive() && isRealId(active.id)) {
      apiPunchOut()
        .then((updated) => setTimesheets(prev => prev.map(ts => (ts.id === active.id ? mapApiTimesheetToFrontend(updated) : ts))))
        .catch((err) => console.warn("Could not persist punch-out to the database:", err));
    }

    return { success: true };
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
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, kycVerified: true } : l));
    const lead = leads.find(l => l.id === leadId);
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
    if (!leads.some(l => l.id === leadId)) {
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

  const addTeamMember = (u: Omit<User, "id" | "created_at" | "updated_at">) => {
    const newUser: User = {
      ...u,
      id: `user-${Date.now()}`,
      passwordStatus: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    setUsers(prev => [...prev, newUser]);

    if (isApiSessionActive() && u.first_name && u.email && u.tempPassword) {
      apiCreateUser({
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        phoneNumber: u.phone_number,
        designation: u.designation,
        role: u.role,
        roleType: u.role_type === "Manager" ? "MANAGER" : u.role_type === "Member" ? "MEMBER" : undefined,
        employmentType: u.employment_type ? EMPLOYMENT_TYPE_TO_API[u.employment_type] : undefined,
        department: u.department,
        managerId: u.managerId,
        password: u.tempPassword
      })
        .then((created) => {
          setUsers(prev => prev.map(existing => (existing.id === newUser.id ? mapApiUserDirectoryEntryToFrontendUser(created) : existing)));
        })
        .catch((err) => console.warn("Could not persist new user to the database:", err));
    }
  };

  const deleteTeamMember = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    if (isApiSessionActive() && isRealId(id)) {
      apiDeleteUser(id).catch((err) => console.warn("Could not delete user from the database:", err));
    }
  };

  const deleteLead = (id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id));
    if (isApiSessionActive() && isRealLeadId(id)) {
      apiDeleteLead(id).catch((err) => console.warn("Could not delete lead from the database:", err));
    }
  };

  const editLead = (id: string, updatedFields: Partial<Lead>) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updatedFields } : l));
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
        activeRole,
        activeSystem,
        setActiveSystem,
        leads,
        properties,
        resaleUnits,
        followupCalls,
        attendanceRecords,
        reimbursements,
        timesheets,
        invoices,
        notifications,
        calendarEvents,
        adSpendRecords,
        isOnline,
        pendingSyncCount: pendingSyncQueue.length,
        isSyncing,
        metaConnected,
        refreshMetaConnectionStatus,
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
