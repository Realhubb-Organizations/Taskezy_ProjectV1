"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

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
    status: "ACTIVE" | "INACTIVE"
  ) => void;
  setCurrentUserPasswordActive: () => void;
  loginWithTempPassword: (email: string, pass: string) => User | null;
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
  deleteCalendarEvent: (id: string) => void;
}

const AppContext = createContext<(AppState & AppActions) | undefined>(undefined);

// Initial Mock CRM Leads (from user's table)
const INITIAL_LEADS: Lead[] = [
  { id: "l-1", name: "Sunanda Ladha", phone: "9849289063", email: "sunanda95@yahoo.com", status: "New Lead", leadScore: 0, campaign: "Realhubb Godrej Bannerghatta Vid Loc", property: "Vanantara", assignedAgent: "Himesh Sengupta", source: "Facebook Lead Ads", createdAtStr: "06 Jul 2026 17:12", kycVerified: false, logs: [] },
  { id: "l-2", name: "Venu Gopal", phone: "9483705852", email: "venumysuru@rediffmail.com", status: "New Lead", leadScore: 0, campaign: "Realhubb B.Granada Kadugodi Road IG.Ai Loc 2", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "06 Jul 2026 16:43", kycVerified: false, logs: [] },
  { id: "l-3", name: "Sudeep Saha", phone: "9945922744", email: "sudeep.saha@hotmail.com", status: "New Lead", leadScore: 0, campaign: "Realhubb B.Granada Kadugodi Road IG.Ai Loc 2", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "06 Jul 2026 15:40", kycVerified: false, logs: [] },
  { id: "l-4", name: "Ram", phone: "7795222590", email: "ramram181298@gmail.com", status: "New Lead", leadScore: 0, campaign: "Realhubb B.Granada Kadugodi Road IG.Ai Loc 2", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "06 Jul 2026 15:24", kycVerified: false, logs: [] },
  { id: "l-5", name: "Siva Jio", phone: "8142282168", email: "jio22295@gmail.com", status: "New Lead", leadScore: 0, campaign: "Realhubb B.Granada Kadugodi Road IG.Ai Loc 2", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "06 Jul 2026 14:25", kycVerified: false, logs: [] },
  { id: "l-6", name: "Anupam Chansoriya", phone: "7905619487", email: "anupam.chansoriya@gmail.com", status: "New Lead", leadScore: 0, campaign: "Realhubb B.Granada Kadugodi Road IG.Ai Loc", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "06 Jul 2026 12:46", kycVerified: false, logs: [] },
  { id: "l-7", name: "Vasudev Rao", phone: "7504111988", email: "decentvasu.111@gmail.com", status: "New Lead", leadScore: 0, campaign: "Realhubb B.Granada Kadugodi Road IG.Ai Loc 2", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "06 Jul 2026 11:37", kycVerified: false, logs: [] },
  { id: "l-8", name: "Sameena ahmed", phone: "9845050504", email: "sameenaahmed6@gmail.com", status: "Call Back", leadScore: 19, campaign: "Realhubb Lodha Sadahalli Vid Loc", property: "Sadahalli", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "05 Jul 2026 14:23", kycVerified: false, logs: [] },
  { id: "l-9", name: "Atul kumar jain", phone: "9363123236", email: "Atul@polywood.org", status: "Call Back", leadScore: 0, campaign: "Realhubb Godrej Coimbatore Plots Vid Loc", property: "Coimbatore", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "05 Jul 2026 09:40", kycVerified: false, logs: [] },
  { id: "l-10", name: "Vignesh", phone: "7708269367", email: "sviki052@gmail.com", status: "Call Back", leadScore: 0, campaign: "Realhubb Godrej Coimbatore Plots Vid Loc", property: "Coimbatore", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "04 Jul 2026 08:26", kycVerified: false, logs: [] },
  { id: "l-11", name: "Subaramani", phone: "9578080902", email: "subbu03@gmail.com", status: "Call Back", leadScore: 0, campaign: "Realhubb Godrej Coimbatore Plots.MY Loc", property: "Coimbatore", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "03 Jul 2026 16:20", kycVerified: false, logs: [] },
  { id: "l-12", name: "Raghavendra Hegde", phone: "8217031789", email: "raghu10@gmail.com", status: "Call Back", leadScore: 33, campaign: "Realhubb B.Granada Kadugodi Road IG.Ai Loc 2", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "02 Jul 2026 18:18", kycVerified: false, logs: [] },
  { id: "l-13", name: "Yash", phone: "8088943602", email: "yash4ever2u@gmail.com", status: "Call Back", leadScore: 35, campaign: "Realhubb B.Granada Kadugodi Road IG.Ai Loc 2", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "02 Jul 2026 17:23", kycVerified: false, logs: [] },
  { id: "l-14", name: "Sivaneswari", phone: "8884670267", email: "sivamano2008@gmail.com", status: "Call Back", leadScore: 29, campaign: "Realhubb Godrej Coimbatore Plots Loc", property: "Coimbatore", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "02 Jul 2026 11:39", kycVerified: false, logs: [] },
  { id: "l-15", name: "Rashmi Ranjan Behera", phone: "9711826494", email: "rashmi.ranjan06@gmail.com", status: "Call Back", leadScore: 37, campaign: "Realhubb B.Granada Kadugodi Road IG.Ai Loc", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "30 Jun 2026 17:59", kycVerified: false, logs: [] },
  { id: "l-16", name: "Murali Mohan", phone: "7760860281", email: "murali8474@gmail.com", status: "Call Back", leadScore: 25, campaign: "Realhubb B.Granada Kadugodi Road Ele.Ai Loc", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "30 Jun 2026 07:31", kycVerified: false, logs: [] },
  { id: "l-17", name: "P Sambasiva Rao", phone: "9916800986", email: "sambasivarao.pulimi@gmail.com", status: "Call Back", leadScore: 35, campaign: "Realhubb B.Granada Kadugodi Road Ele.Ai Loc", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "28 Jun 2026 14:27", kycVerified: false, logs: [] },
  { id: "l-18", name: "Abhinav Kumar", phone: "9092386356", email: "Abhi@gmail.com", status: "Call Back", leadScore: 31, campaign: "Realhubb B.Granada Kadugodi Road Ele.Ai Loc", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "27 Jun 2026 21:25", kycVerified: false, logs: [] },
  { id: "l-19", name: "Udit Agarwal", phone: "9411656264", email: "anomaly2104@gmail.com", status: "Call Back", leadScore: 29, campaign: "Realhubb B.Granada Kadugodi Road Ele.Ai Loc", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "26 Jun 2026 00:21", kycVerified: false, logs: [] },
  { id: "l-20", name: "Ramesh Ganiyar", phone: "9620025320", email: "ramuganiyar@gmail.com", status: "Call Back", leadScore: 29, campaign: "Realhubb Lodha Sadahalli Vid Loc", property: "Sadahalli", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "25 Jun 2026 21:35", kycVerified: false, logs: [] },
  { id: "l-21", name: "Mohitha Uday", phone: "7022908511", email: "mohitha.mohite@gmail.com", status: "Revived", leadScore: 19, campaign: "Realhubb Mahindra Hopefarm Vid.Ai", property: "Blossom", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "24 Jun 2026 08:19", kycVerified: false, logs: [] },
  { id: "l-22", name: "B A R K H A", phone: "8056298652", email: "sarawgibarkha@gmail.com", status: "After RERA", leadScore: 27, campaign: "Realhubb B.Granada Kadugodi Road Ele.Ai Loc", property: "Granada", assignedAgent: "Bicky Roy", source: "Facebook Lead Ads", createdAtStr: "05 Jul 2026 23:27", kycVerified: false, logs: [] },
  { id: "l-23", name: "Yogesh Patil", phone: "9764415754", email: "patelyogesh444@gmail.com", status: "Call Back", leadScore: 27, campaign: "Realhubb B.Granada Kadugodi Road Ele.Ai Loc", property: "Granada", assignedAgent: "Santosh Ray", source: "Facebook Lead Ads", createdAtStr: "28 Jun 2026 09:01", kycVerified: false, logs: [] },
  { id: "l-24", name: "Seven Hills", phone: "9000497245", email: "nusum.yedukondalu@gmail.com", status: "Call Back", leadScore: 45, campaign: "Godrej Kukatpally Vid Loc", property: "Kukatpalli", assignedAgent: "Santhosh Reddy B", source: "Facebook Lead Ads", createdAtStr: "20 Jun 2026 23:28", kycVerified: false, logs: [] },
  { id: "l-25", name: "Nikhil Kumar Srivastava", phone: "8978918451", email: "nikhilkumarsri@yahoo.co.uk", status: "Call Back", leadScore: 45, campaign: "Godrej Kukatpally Vid.Ai Foc", property: "Kukatpalli", assignedAgent: "Santhosh Reddy B", source: "Facebook Lead Ads", createdAtStr: "17 Jun 2026 19:57", kycVerified: false, logs: [] }
];

// Deterministic pseudo-random helper so seed data is stable across reloads
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function parseCreatedAtStr(str?: string): string {
  if (!str) return new Date().toISOString();
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

// Back-fill SLA telemetry (assignedAt / firstResponseAt) so missed-lead reports have real data on first load.
// A lead still sitting in its initial "New Lead" state is treated as un-responded (and thus a candidate "missed" lead).
INITIAL_LEADS.forEach((lead, idx) => {
  lead.assignedAt = parseCreatedAtStr(lead.createdAtStr);
  if (lead.status !== "New Lead" && lead.status !== "New") {
    const responseDelayMinutes = 5 + Math.floor(pseudoRandom(idx + 1) * 85); // 5–90 min response time
    lead.firstResponseAt = new Date(new Date(lead.assignedAt).getTime() + responseDelayMinutes * 60000).toISOString();
  }
});

// Mock Properties (from user's list)
const INITIAL_PROPERTIES: Property[] = [
  {
    id: "prop-1",
    name: "Altura",
    developer: "TVS",
    location: "Sathanur, Bengaluru",
    locality: "Sathanur, Bengaluru",
    type: "Apartment",
    membersCount: 2,
    price: "₹1.34 Cr+",
    projectStatus: "Pre-Launch",
    possessionDate: "30 Dec 2030",
    landParcel: "10.06 Acres",
    towers: "12 Towers",
    structure: "2B + G + 12 Floors",
    amenities: ["Grand 32k sqft Clubhouse", "30+ Outdoor Amenities", "Water Bodies", "71% Open Space"],
    contactNumber: "+91 99801 89914",
    websiteUrl: "https://realhubb.in",
    description: "TVS Sathanur – Where Comfort Meets Serenity"
  },
  { id: "prop-2", name: "Belvedere", developer: "Brigade", location: "Budigere Cross, Bengaluru East", type: "Apartment", membersCount: 1 },
  { id: "prop-3", name: "Blossom", developer: "Mahindra", location: "Kadugodi, Whitefield", locality: "Channasandra, Bengaluru", type: "Apartment", membersCount: 1 },
  { id: "prop-4", name: "Clubclass", developer: "Ramky", location: "North Bengaluru", locality: "Thannisandra", type: "Apartment", membersCount: 1 },
  { id: "prop-5", name: "Coimbatore", developer: "Godrej", location: "Coimbatore", locality: "Coimbatore", type: "Plot", membersCount: 2 },
  { id: "prop-6", name: "Ebony", developer: "Brigade", location: "Devanahalli, North Bengaluru", type: "Apartment", membersCount: 1 },
  { id: "prop-7", name: "Eternia", developer: "Brigade", location: "Yelahanka, Bengaluru", type: "Apartment", membersCount: 1 },
  { id: "prop-8", name: "Granada", developer: "Brigade", location: "East, Bengaluru", type: "Apartment", membersCount: 2, price: "₹1.20 Cr" },
  { id: "prop-9", name: "Heart of Harmony", developer: "CKPC", location: "Hosur Main Road, Bengaluru", type: "Apartment", membersCount: 1 },
  { id: "prop-10", name: "Insignia", developer: "Brigade", location: "Yelahanka, Bengaluru", type: "Apartment", membersCount: 1 }
];

// Mock Resale Units
const INITIAL_RESALE_UNITS: ResaleUnit[] = [
  { id: "resale-1", property: "Assetz Promise of Spring", builder: "Assetz", location: "North, Bengaluru", price: "1.60 Cr", description: "North facing unit, excellent view.", listedBy: "SqftGenius Solutions LLP" },
  { id: "resale-2", property: "Prestige Meridian Park", builder: "Prestige Group", location: "Sarjapur Road, Bengaluru", price: "2.40 Cr", description: "3+Maid - 1865 Sft - East Facing", listedBy: "SqftGenius Solutions LLP" }
];

// Mock Followup Calls
const INITIAL_FOLLOWUPS: FollowupCall[] = [
  { id: "c-1", time: "10:00 am", status: "Missed", leadName: "Udit Agarwal", phone: "+919411656264", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-2", time: "10:00 am", status: "Missed", leadName: "Ramesh Ganiyar", phone: "+919620025320", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-3", time: "10:00 am", status: "Missed", leadName: "Abhinav Kumar", phone: "+919092386356", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-4", time: "10:00 am", status: "Missed", leadName: "P Sambasiva Rao", phone: "+919916800986", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-5", time: "10:00 am", status: "Missed", leadName: "Murali Mohan", phone: "+917760860281", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-6", time: "10:00 am", status: "Missed", leadName: "Sivaneswari", phone: "8884670267", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-7", time: "10:00 am", status: "Missed", leadName: "Rashmi Ranjan Behera", phone: "+919711826494", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-8", time: "10:00 am", status: "Missed", leadName: "Yash", phone: "8088943602", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-9", time: "10:00 am", status: "Missed", leadName: "Raghavendra Hegde", phone: "+918217031789", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-10", time: "10:00 am", status: "Missed", leadName: "Subaramani", phone: "+919578080902", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-11", time: "10:00 am", status: "Missed", leadName: "Vignesh", phone: "+917708269367", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-12", time: "10:00 am", status: "Missed", leadName: "Atul kumar jain", phone: "+919363123236", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-13", time: "10:00 am", status: "Missed", leadName: "Sameena ahmed", phone: "+19845050504", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-14", time: "10:50 am", status: "Missed", leadName: "Yogesh Patil", phone: "+919764415754", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-15", time: "12:30 pm", status: "Missed", leadName: "nagaraj", phone: "+917829557727", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-16", time: "12:30 pm", status: "Missed", leadName: "Ravi Teja K", phone: "+917674835835", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-17", time: "12:30 pm", status: "Missed", leadName: "Johanna Lozano", phone: "+16466442647", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-18", time: "12:30 pm", status: "Missed", leadName: "Srikanth Kadithota", phone: "+6582082765", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-19", time: "12:30 pm", status: "Missed", leadName: "Prem Koribilli", phone: "+917799000490", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-20", time: "12:30 pm", status: "Missed", leadName: "Ramesh", phone: "+919866342404", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-21", time: "12:30 pm", status: "Missed", leadName: "Swati Priya", phone: "+919582022336", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-22", time: "12:30 pm", status: "Missed", leadName: "Richa Mahar Dhek", phone: "+919686611194", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-23", time: "12:30 pm", status: "Missed", leadName: "A V Subba Rao", phone: "+919441282929", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-24", time: "12:30 pm", status: "Missed", leadName: "Avantika Choudhary", phone: "+916287132727", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-25", time: "12:30 pm", status: "Missed", leadName: "Seven Hills", phone: "+919000497245", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-26", time: "12:30 pm", status: "Missed", leadName: "Nikhil Kumar Srivastava", phone: "+918978918451", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-27", time: "02:00 pm", status: "Missed", leadName: "Jannet svlester", phone: "+919886080762", type: "Callback", assignedTo: "Himesh Sengupta" },
  { id: "c-28", time: "02:00 pm", status: "Missed", leadName: "Devi", phone: "+919789493072", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-29", time: "02:30 pm", status: "Missed", leadName: "Sabah Solim", phone: "97455334684", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-30", time: "03:00 pm", status: "Missed", leadName: "mahammad khan", phone: "+919059844148", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-31", time: "03:00 pm", status: "Missed", leadName: "Subrajeet", phone: "+918553112360", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-32", time: "03:00 pm", status: "Missed", leadName: "Sananda Mukherjee", phone: "+917829907449", type: "Callback", assignedTo: "Himesh Sengupta" },
  { id: "c-33", time: "03:40 pm", status: "Missed", leadName: "Harish KN", phone: "+919945081245", type: "Callback", assignedTo: "Bibhuti Kumar" },
  { id: "c-34", time: "04:00 pm", status: "Missed", leadName: "Vasudev", phone: "+918095393075", type: "Callback", assignedTo: "Himesh Sengupta" },
  { id: "c-35", time: "04:00 pm", status: "Missed", leadName: "L D SANATH KUMAR", phone: "+919535909197", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-36", time: "04:00 pm", status: "Missed", leadName: "Ranju V", phone: "+919606567980", type: "Callback", assignedTo: "Himesh Sengupta" },
  { id: "c-37", time: "04:30 pm", status: "Missed", leadName: "Jamie chiasson Nora rose jean", phone: "+15062717105", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-38", time: "04:30 pm", status: "Missed", leadName: "Geeta Reddy", phone: "+19086428834", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-39", time: "05:00 pm", status: "Missed", leadName: "Piyush narang", phone: "+919466760230", type: "Callback", assignedTo: "Himesh Sengupta" },
  { id: "c-40", time: "05:00 pm", status: "Missed", leadName: "Nitin Sharma", phone: "+917738052501", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-41", time: "05:00 pm", status: "Missed", leadName: "Madhuri P", phone: "+919036082066", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-42", time: "05:00 pm", status: "Missed", leadName: "babu", phone: "+916362986246", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-43", time: "05:25 pm", status: "Missed", leadName: "Arun Yadav", phone: "8197062438", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-44", time: "05:30 pm", status: "Missed", leadName: "Aryan Kumar", phone: "+918296624230", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-45", time: "05:30 pm", status: "Missed", leadName: "Ramya Baratam", phone: "+917204772353", type: "Callback", assignedTo: "Akhil Raj Singh" },
  { id: "c-46", time: "05:40 pm", status: "Missed", leadName: "Kranthi Mandapalli", phone: "+917867080154", type: "Callback", assignedTo: "Akhil Raj Singh" },
  { id: "c-47", time: "05:40 pm", status: "Missed", leadName: "Abhishek Singh", phone: "9941613242", type: "Callback", assignedTo: "Akhil Raj Singh" },
  { id: "c-48", time: "05:45 pm", status: "Missed", leadName: "Tripti Tarun Mishra", phone: "+919958304056", type: "Callback", assignedTo: "Akhil Raj Singh" },
  { id: "c-49", time: "06:00 pm", status: "Missed", leadName: "Arshad Ahmed", phone: "+919972711552", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-50", time: "06:00 pm", status: "Missed", leadName: "Tarun", phone: "+919108218092", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-51", time: "06:00 pm", status: "Missed", leadName: "Chandani", phone: "+917892805252", type: "Callback", assignedTo: "Akhil Raj Singh" },
  { id: "c-52", time: "06:00 pm", status: "Missed", leadName: "Guru", phone: "+917483856720", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-53", time: "06:00 pm", status: "Missed", leadName: "ANKUR GOEL", phone: "9019040351", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-54", time: "06:00 pm", status: "Missed", leadName: "Sidie Sid", phone: "+919102388606", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-55", time: "06:10 pm", status: "Missed", leadName: "Navin Jain", phone: "+919350392993", type: "Callback", assignedTo: "Bicky Roy" },
  { id: "c-56", time: "06:20 pm", status: "Missed", leadName: "Arjun Shashidhar", phone: "+918971714887", type: "Callback", assignedTo: "Neha Chourey" },
  { id: "c-57", time: "06:20 pm", status: "Missed", leadName: "Seshank@Thanvi", phone: "+919100741366", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-58", time: "06:20 pm", status: "Missed", leadName: "Indra", phone: "+919740376104", type: "Callback", assignedTo: "Bicky Roy" },
  { id: "c-59", time: "06:30 pm", status: "Missed", leadName: "Kallappa Hittalakeri", phone: "+17625071200", type: "Callback", assignedTo: "Santhosh Reddy B" },
  { id: "c-60", time: "06:30 pm", status: "Missed", leadName: "Deepak", phone: "+917780671732", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-61", time: "06:30 pm", status: "Missed", leadName: "Harish Chellur", phone: "+919480446840", type: "Callback", assignedTo: "Bicky Roy" },
  { id: "c-62", time: "06:30 pm", status: "Missed", leadName: "P", phone: "+918970130784", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-63", time: "06:35 pm", status: "Missed", leadName: "Santosh Mitra Sharma", phone: "+917488361751", type: "Callback", assignedTo: "Santosh Ray" },
  { id: "c-64", time: "07:00 pm", status: "Missed", leadName: "Kranthi Karamalaputi", phone: "+919941215119", type: "Meeting", assignedTo: "Bicky Roy" },
  { id: "c-65", time: "07:15 pm", status: "Missed", leadName: "Kiran Kumar Ballamudi", phone: "+918939682463", type: "Callback", assignedTo: "Bicky Roy" }
];

// Mock Attendance
const INITIAL_ATTENDANCE: AttendanceRecord[] = [
  { employeeName: "Akhil Raj Singh", email: "sales1@realhubb.in", designation: "Sales Associate", presentDays: 22, totalDays: 27, onTime: 20, late: 2 },
  { employeeName: "Bibhuti Kumar", email: "sales2@realhubb.in", designation: "Sales Associate", presentDays: 24, totalDays: 27, onTime: 23, late: 1 },
  { employeeName: "Bicky Roy", email: "sales3@realhubb.in", designation: "Sales Associate", presentDays: 21, totalDays: 27, onTime: 19, late: 2 },
  { employeeName: "Neha Chourey", email: "sales4@realhubb.in", designation: "Sales Associate", presentDays: 23, totalDays: 27, onTime: 22, late: 1 },
  { employeeName: "Himesh Sengupta", email: "sales5@realhubb.in", designation: "Sales Associate", presentDays: 25, totalDays: 27, onTime: 24, late: 1 },
  { employeeName: "Gautham Karanam", email: "sales.manager1@realhubb.in", designation: "Sales Manager", presentDays: 26, totalDays: 27, onTime: 25, late: 1 },
  { employeeName: "Santosh Ray", email: "sales.manager3@realhubb.in", designation: "Sales Manager", presentDays: 25, totalDays: 27, onTime: 23, late: 2 },
  { employeeName: "Sanjeev Kumar", email: "sales.manager2@realhubb.in", designation: "Sales Manager", presentDays: 26, totalDays: 27, onTime: 26, late: 0 },
  { employeeName: "Rohan Das", email: "it1@realhubb.in", designation: "IT Associate", presentDays: 23, totalDays: 27, onTime: 21, late: 2 },
  { employeeName: "Abhinav Sharma", email: "it2@realhubb.in", designation: "IT Associate", presentDays: 24, totalDays: 27, onTime: 22, late: 2 },
  { employeeName: "Karan Malhotra", email: "marketing1@realhubb.in", designation: "Marketing Associate", presentDays: 22, totalDays: 27, onTime: 20, late: 2 },
  { employeeName: "Sneha Rao", email: "marketing2@realhubb.in", designation: "Marketing Associate", presentDays: 23, totalDays: 27, onTime: 21, late: 2 },
  { employeeName: "Priya Patel", email: "marketing3@realhubb.in", designation: "Marketing Associate", presentDays: 24, totalDays: 27, onTime: 23, late: 1 },
  { employeeName: "Partha Mazumdar", email: "finance@realhubb.in", designation: "Finance Controller", presentDays: 25, totalDays: 27, onTime: 24, late: 1 }
];

// Mock Reimbursement Claims
const INITIAL_REIMBURSEMENTS: ReimbursementClaim[] = [
  { id: "claim-1", title: "Mobile Bill - June", type: "Mobile Bills", amount: 300, status: "Paid", date: "2026-07-01", agentName: "Akhil Raj Singh", notes: "Attested office work calls" },
  { id: "claim-2", title: "Fuel Reimbursement - Site visit Granada", type: "Fuel Expenses", amount: 2400, status: "Pending", date: "2026-07-04", agentName: "Bicky Roy", notes: "Customer visit logs attached" }
];

// Mock Invoices
const INITIAL_INVOICES: Invoice[] = [
  { id: "inv-1", invoiceNumber: "INV-2026-8090", leadId: "l-8", clientName: "Priya (Arvind)", baseAmount: 0, cgst: 0, sgst: 0, totalAmount: 0, status: "Draft", createdAt: "2026-07-05", dueDate: "2026-07-20", projectName: "N/A", unitNo: "N/A", unitDimension: "0", brokerageType: "Percentage", brokerageRate: "0%", collectionStatus: "Pending", collectedAmount: 0 },
  { id: "inv-2", invoiceNumber: "INV-2026-8091", leadId: "l-9", clientName: "Sachin Jhunjhunwala", baseAmount: 0, cgst: 0, sgst: 0, totalAmount: 0, status: "Draft", createdAt: "2026-07-06", dueDate: "2026-07-21", developerName: "CKPC", projectName: "Heart of Harmony", unitNo: "N/A", unitDimension: "0", brokerageType: "Percentage", brokerageRate: "0%", collectionStatus: "Pending", collectedAmount: 0 }
];

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

// Seed Notification Feed (CRM: New Leads + Reminder Alerts, HRMS, Finance)
const INITIAL_NOTIFICATIONS: Notification[] = [
  // CRM: New Leads
  ...INITIAL_LEADS.slice(0, 6).map((lead, idx) => ({
    id: `notif-lead-${lead.id}`,
    system: "CRM" as SystemType,
    category: "NEW_LEAD" as NotificationCategory,
    title: "New Lead Captured",
    message: `${lead.name} • ${lead.property || "Unassigned Project"} • via ${lead.source || "Direct"}`,
    timestamp: new Date(Date.now() - idx * 9 * 60000).toISOString(),
    read: idx > 2,
    leadId: lead.id
  })),
  // CRM: Reminder Alerts
  ...INITIAL_FOLLOWUPS.slice(0, 6).map((call, idx) => {
    const matchedLead = INITIAL_LEADS.find(l => normalizePhone(l.phone) === normalizePhone(call.phone));
    return {
      id: `notif-call-${call.id}`,
      system: "CRM" as SystemType,
      category: "REMINDER" as NotificationCategory,
      title: call.status === "Missed" ? "Missed Follow-up" : `${call.type} Reminder`,
      message: `${call.leadName} • ${call.time} • Assigned to ${call.assignedTo}`,
      timestamp: new Date(Date.now() - (idx + 2) * 14 * 60000).toISOString(),
      read: idx > 3,
      leadId: matchedLead?.id
    };
  }),
  // HRMS: Attendance patterns
  ...INITIAL_ATTENDANCE.filter(r => r.late > 1).slice(0, 4).map((rec, idx) => ({
    id: `notif-hr-late-${idx}`,
    system: "HRMS" as SystemType,
    category: "ATTENDANCE" as NotificationCategory,
    title: "Late Clock-In Pattern Detected",
    message: `${rec.employeeName} (${rec.designation}) has ${rec.late} late punches this cycle.`,
    timestamp: new Date(Date.now() - (idx + 1) * 40 * 60000).toISOString(),
    read: idx > 1,
    link: "/dashboard/hrms?tab=attendance"
  })),
  {
    id: "notif-hr-leave-1",
    system: "HRMS" as SystemType,
    category: "LEAVE" as NotificationCategory,
    title: "Leave Balance Critical",
    message: "Karan Malhotra (Marketing Associate) has 0 leave days remaining.",
    timestamp: new Date(Date.now() - 55 * 60000).toISOString(),
    read: false,
    link: "/dashboard/hrms?tab=teams"
  },
  {
    id: "notif-hr-onboard-1",
    system: "HRMS" as SystemType,
    category: "GENERAL" as NotificationCategory,
    title: "New Team Member Onboarded",
    message: "Abhinav Sharma joined the TECH department as IT Associate.",
    timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
    read: true,
    link: "/dashboard/hrms?tab=teams"
  },
  // Finance: Draft invoices pending generation
  ...INITIAL_INVOICES.filter(i => i.status === "Draft").map((inv, idx) => ({
    id: `notif-fin-inv-${inv.id}`,
    system: "FINANCE" as SystemType,
    category: "INVOICE" as NotificationCategory,
    title: "Invoice Pending Generation",
    message: `${inv.clientName} • Booking awaiting KYC verification & GST invoice.`,
    timestamp: new Date(Date.now() - (idx + 1) * 25 * 60000).toISOString(),
    read: false,
    link: "/dashboard/finance?tab=billing"
  })),
  // Finance: Pending reimbursement claims
  ...INITIAL_REIMBURSEMENTS.filter(c => c.status === "Pending").map((c, idx) => ({
    id: `notif-fin-claim-${c.id}`,
    system: "FINANCE" as SystemType,
    category: "CLAIM" as NotificationCategory,
    title: "New Reimbursement Claim",
    message: `${c.agentName} submitted "${c.title}" • ₹${c.amount.toLocaleString()}`,
    timestamp: new Date(Date.now() - (idx + 1) * 18 * 60000).toISOString(),
    read: false,
    link: "/dashboard/finance?tab=reimbursements"
  }))
];

// Seed Marketing Ad Spend (Meta/Google, daily records across early July 2026, tied to campaigns/properties for reporting)
const AD_ACCOUNTS: { platform: "Meta" | "Google"; name: string; property: string }[] = [
  { platform: "Meta", name: "Realhubb Godrej Bannerghatta Vid Loc", property: "Vanantara" },
  { platform: "Meta", name: "Realhubb B.Granada Kadugodi Road IG.Ai Loc 2", property: "Granada" },
  { platform: "Meta", name: "Realhubb Lodha Sadahalli Vid Loc", property: "Sadahalli" },
  { platform: "Meta", name: "Realhubb Godrej Coimbatore Plots Vid Loc", property: "Coimbatore" },
  { platform: "Meta", name: "Realhubb Mahindra Hopefarm Vid.Ai", property: "Blossom" },
  { platform: "Google", name: "Search Ads - Coimbatore", property: "Coimbatore" },
  { platform: "Google", name: "Granada Display Network", property: "Granada" },
  { platform: "Google", name: "Direct Search - Organic Landing", property: "Vanantara" }
];

const AD_SPEND_DATES = ["2026-07-01", "2026-07-03", "2026-07-05", "2026-07-07", "2026-07-09", "2026-07-11", "2026-07-13", "2026-07-14"];

const INITIAL_AD_SPEND_RECORDS: AdSpendRecord[] = AD_ACCOUNTS.flatMap((account, accIdx) =>
  AD_SPEND_DATES.map((date, dateIdx) => {
    const seed = accIdx * 31 + dateIdx * 7 + 1;
    const baseSpend = account.platform === "Meta" ? 2200 : 1400;
    const spend = Math.round(baseSpend + pseudoRandom(seed) * baseSpend);
    const leadsGenerated = Math.max(1, Math.round((spend / (account.platform === "Meta" ? 380 : 520)) + pseudoRandom(seed + 100) * 3));
    return {
      id: `ad-${accIdx}-${dateIdx}`,
      platform: account.platform,
      accountName: account.name,
      property: account.property,
      date,
      spend,
      leadsGenerated
    };
  })
);

// Seed Calendar Feed (CRM: site visits/followups/bookings/EOI, HRMS: holidays/absences/events, Finance: reminders/tasks)
const INITIAL_CALENDAR_EVENTS: CalendarEvent[] = [
  // CRM: Site Visits
  { id: "cal-crm-1", system: "CRM", type: "SITE_VISIT", title: "Site Visit — Granada", date: "2026-07-15", time: "11:00", description: "Property walkthrough with prospective buyer.", leadId: "l-2" },
  { id: "cal-crm-2", system: "CRM", type: "SITE_VISIT", title: "Site Visit — Coimbatore Plots", date: "2026-07-17", time: "15:30", description: "Plot boundary inspection.", leadId: "l-9" },
  { id: "cal-crm-3", system: "CRM", type: "SITE_VISIT", title: "Site Visit — Blossom", date: "2026-07-20", time: "10:00", description: "Model flat walkthrough.", leadId: "l-21" },
  // CRM: Followups
  { id: "cal-crm-4", system: "CRM", type: "FOLLOWUP", title: "Callback — Udit Agarwal", date: "2026-07-14", time: "10:00", leadId: "l-19" },
  { id: "cal-crm-5", system: "CRM", type: "FOLLOWUP", title: "Callback — Ramesh Ganiyar", date: "2026-07-14", time: "10:00", leadId: "l-20" },
  { id: "cal-crm-6", system: "CRM", type: "FOLLOWUP", title: "Callback — Sameena Ahmed", date: "2026-07-16", time: "14:00", leadId: "l-8" },
  // CRM: Bookings
  { id: "cal-crm-7", system: "CRM", type: "BOOKING", title: "Booking Finalized — Granada Unit", date: "2026-07-18", description: "Contract signing scheduled." },
  // CRM: EOI
  { id: "cal-crm-8", system: "CRM", type: "EOI", title: "EOI Submitted — Sadahalli Plot", date: "2026-07-19", description: "Expression of interest form collected." },

  // HRMS: Holidays
  { id: "cal-hr-holiday-1", system: "HRMS", type: "HOLIDAY", title: "Company Foundation Day", date: "2026-07-20", description: "Office closed company-wide." },
  { id: "cal-hr-holiday-2", system: "HRMS", type: "HOLIDAY", title: "Independence Day", date: "2026-08-15", description: "National holiday." },
  { id: "cal-hr-holiday-3", system: "HRMS", type: "HOLIDAY", title: "Gandhi Jayanti", date: "2026-10-02", description: "National holiday." },
  { id: "cal-hr-holiday-4", system: "HRMS", type: "HOLIDAY", title: "Diwali", date: "2026-11-08", description: "Festival holiday." },
  // HRMS: Absences (click a day to see who was out)
  { id: "cal-hr-absence-1", system: "HRMS", type: "ABSENCE", title: "Team Absences", date: "2026-07-10", employeeNames: ["Bicky Roy", "Karan Malhotra"] },
  { id: "cal-hr-absence-2", system: "HRMS", type: "ABSENCE", title: "Team Absences", date: "2026-07-12", employeeNames: ["Sneha Rao"] },
  // HRMS: Admin-scheduled event (visible to every member's HRMS calendar)
  { id: "cal-hr-event-1", system: "HRMS", type: "ADMIN_EVENT", title: "All-Hands Town Hall", date: "2026-07-22", time: "16:00", description: "Quarterly update from leadership.", createdBy: "Sanjeev Singh" },

  // Finance: Payment reminders (from invoice due dates)
  { id: "cal-fin-pay-1", system: "FINANCE", type: "PAYMENT_REMINDER", title: "Invoice Due — Priya (Arvind)", date: "2026-07-20", description: "INV-2026-8090 due for collection." },
  { id: "cal-fin-pay-2", system: "FINANCE", type: "PAYMENT_REMINDER", title: "Invoice Due — Sachin Jhunjhunwala", date: "2026-07-21", description: "INV-2026-8091 due for collection." },
  // Finance: Tasks
  { id: "cal-fin-task-1", system: "FINANCE", type: "TASK", title: "GST Filing Due", date: "2026-07-20", description: "Monthly GST return filing deadline." },
  { id: "cal-fin-task-2", system: "FINANCE", type: "TASK", title: "Reimbursement Batch Payout", date: "2026-07-16", description: "Process pending agent expense claims." }
];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Subscription Configuration State - default to active subscription for easy demoing!
  const [adminSeats, setAdminSeats] = useState(1);
  const [financeSeats, setFinanceSeats] = useState(1);
  const [agentSeats, setAgentSeats] = useState(12);
  const [isPaid, setIsPaid] = useState(true);
  const [isProvisioned, setIsProvisioned] = useState(true);

  // Authentication & Users State
  const [users, setUsers] = useState<User[]>([
    {
      id: "user-admin",
      name: "Sanjeev Singh",
      first_name: "Sanjeev",
      last_name: "Singh",
      email: "admin@realhubb.in",
      company_email: "admin@realhubb.in",
      personal_email: "sanjeev.personal@gmail.com",
      phone_number: "9980189914",
      role: "ADMIN",
      passwordStatus: "ACTIVE",
      password_hash: "admin",
      tempPassword: "admin",
      designation: "Global Administrator",
      role_type: "Manager",
      employment_type: "FULL TIME",
      department: "TECH",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "user-fin-1",
      name: "Partha Mazumdar",
      first_name: "Partha",
      last_name: "Mazumdar",
      email: "finance@realhubb.in",
      company_email: "finance@realhubb.in",
      personal_email: "partha.personal@gmail.com",
      phone_number: "9876500993",
      role: "FINANCE",
      passwordStatus: "ACTIVE",
      password_hash: "finance",
      tempPassword: "finance",
      designation: "Finance Controller",
      role_type: "Manager",
      employment_type: "FULL TIME",
      department: "FINANCE",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "user-mgr-sales",
      name: "Gautham Karanam",
      first_name: "Gautham",
      last_name: "Karanam",
      email: "sales.manager1@realhubb.in",
      company_email: "sales.manager1@realhubb.in",
      personal_email: "gautham.personal@gmail.com",
      phone_number: "9876500991",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "manager",
      tempPassword: "manager",
      designation: "Sales Manager",
      role_type: "Manager",
      employment_type: "FULL TIME",
      department: "SALES",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "user-mgr-tech",
      name: "Sanjeev Kumar",
      first_name: "Sanjeev",
      last_name: "Kumar",
      email: "sales.manager2@realhubb.in",
      company_email: "sales.manager2@realhubb.in",
      personal_email: "sanjeev.k@gmail.com",
      phone_number: "9876500994",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "manager",
      tempPassword: "manager",
      designation: "Sales Manager",
      role_type: "Manager",
      employment_type: "FULL TIME",
      department: "SALES",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "user-mgr-mktg",
      name: "Santosh Ray",
      first_name: "Santosh",
      last_name: "Ray",
      email: "sales.manager3@realhubb.in",
      company_email: "sales.manager3@realhubb.in",
      personal_email: "santosh.personal@gmail.com",
      phone_number: "9876500992",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "manager",
      tempPassword: "manager",
      designation: "Sales Manager",
      role_type: "Manager",
      employment_type: "FULL TIME",
      department: "SALES",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    // 5 Sales department members
    {
      id: "user-sales-1",
      name: "Akhil Raj Singh",
      first_name: "Akhil",
      last_name: "Raj Singh",
      email: "sales1@realhubb.in",
      company_email: "sales1@realhubb.in",
      personal_email: "akhil@gmail.com",
      phone_number: "9876500101",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "member",
      tempPassword: "member",
      designation: "Sales Associate",
      role_type: "Member",
      employment_type: "FULL TIME",
      department: "SALES",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "user-sales-2",
      name: "Bibhuti Kumar",
      first_name: "Bibhuti",
      last_name: "Kumar",
      email: "sales2@realhubb.in",
      company_email: "sales2@realhubb.in",
      personal_email: "bibhuti@gmail.com",
      phone_number: "9876500102",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "member",
      tempPassword: "member",
      designation: "Sales Associate",
      role_type: "Member",
      employment_type: "FULL TIME",
      department: "SALES",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "user-sales-3",
      name: "Bicky Roy",
      first_name: "Bicky",
      last_name: "Roy",
      email: "sales3@realhubb.in",
      company_email: "sales3@realhubb.in",
      personal_email: "bicky@gmail.com",
      phone_number: "9876500103",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "member",
      tempPassword: "member",
      designation: "Sales Associate",
      role_type: "Member",
      employment_type: "FULL TIME",
      department: "SALES",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "user-sales-4",
      name: "Neha Chourey",
      first_name: "Neha",
      last_name: "Chourey",
      email: "sales4@realhubb.in",
      company_email: "sales4@realhubb.in",
      personal_email: "neha@gmail.com",
      phone_number: "9876500104",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "member",
      tempPassword: "member",
      designation: "Sales Associate",
      role_type: "Member",
      employment_type: "FULL TIME",
      department: "SALES",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "user-sales-5",
      name: "Himesh Sengupta",
      first_name: "Himesh",
      last_name: "Sengupta",
      email: "sales5@realhubb.in",
      company_email: "sales5@realhubb.in",
      personal_email: "himesh@gmail.com",
      phone_number: "9876500105",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "member",
      tempPassword: "member",
      designation: "Sales Associate",
      role_type: "Member",
      employment_type: "FULL TIME",
      department: "SALES",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    // 2 IT members
    {
      id: "user-it-1",
      name: "Rohan Das",
      first_name: "Rohan",
      last_name: "Das",
      email: "it1@realhubb.in",
      company_email: "it1@realhubb.in",
      personal_email: "rohan@gmail.com",
      phone_number: "9876500201",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "member",
      tempPassword: "member",
      designation: "IT Associate",
      role_type: "Member",
      employment_type: "FULL TIME",
      department: "TECH",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "user-it-2",
      name: "Abhinav Sharma",
      first_name: "Abhinav",
      last_name: "Sharma",
      email: "it2@realhubb.in",
      company_email: "it2@realhubb.in",
      personal_email: "abhinav@gmail.com",
      phone_number: "9876500202",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "member",
      tempPassword: "member",
      designation: "IT Associate",
      role_type: "Member",
      employment_type: "FULL TIME",
      department: "TECH",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    // 3 Marketing members
    {
      id: "user-mktg-1",
      name: "Karan Malhotra",
      first_name: "Karan",
      last_name: "Malhotra",
      email: "marketing1@realhubb.in",
      company_email: "marketing1@realhubb.in",
      personal_email: "karan@gmail.com",
      phone_number: "9876500301",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "member",
      tempPassword: "member",
      designation: "Marketing Associate",
      role_type: "Member",
      employment_type: "FULL TIME",
      department: "MARKETING",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "user-mktg-2",
      name: "Sneha Rao",
      first_name: "Sneha",
      last_name: "Rao",
      email: "marketing2@realhubb.in",
      company_email: "marketing2@realhubb.in",
      personal_email: "sneha@gmail.com",
      phone_number: "9876500302",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "member",
      tempPassword: "member",
      designation: "Marketing Associate",
      role_type: "Member",
      employment_type: "FULL TIME",
      department: "MARKETING",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "user-mktg-3",
      name: "Priya Patel",
      first_name: "Priya",
      last_name: "Patel",
      email: "marketing3@realhubb.in",
      company_email: "marketing3@realhubb.in",
      personal_email: "priya@gmail.com",
      phone_number: "9876500303",
      role: "AGENT",
      passwordStatus: "ACTIVE",
      password_hash: "member",
      tempPassword: "member",
      designation: "Marketing Associate",
      role_type: "Member",
      employment_type: "FULL TIME",
      department: "MARKETING",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ]);
  
  // Default to pre-logged in Admin Sanjeev Singh!
  const [currentUser, setCurrentUser] = useState<User | null>({
    id: "user-admin",
    name: "Sanjeev Singh",
    first_name: "Sanjeev",
    last_name: "Singh",
    email: "admin@realhubb.in",
    company_email: "admin@realhubb.in",
    role: "ADMIN",
    passwordStatus: "ACTIVE",
    designation: "Global Administrator",
    role_type: "Manager",
    department: "TECH",
    status: "ACTIVE"
  });
  const [activeRole, setActiveRole] = useState<Role>("ADMIN");
  const [activeSystem, setActiveSystem] = useState<SystemType>("ADMIN");

  // Core Module States
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS);
  const [properties, setProperties] = useState<Property[]>(INITIAL_PROPERTIES);
  const [resaleUnits, setResaleUnits] = useState<ResaleUnit[]>(INITIAL_RESALE_UNITS);
  const [followupCalls, setFollowupCalls] = useState<FollowupCall[]>(INITIAL_FOLLOWUPS);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(INITIAL_ATTENDANCE);
  const [reimbursements, setReimbursements] = useState<ReimbursementClaim[]>(INITIAL_REIMBURSEMENTS);
  const [timesheets, setTimesheets] = useState<TimesheetLog[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(INITIAL_CALENDAR_EVENTS);
  const [adSpendRecords] = useState<AdSpendRecord[]>(INITIAL_AD_SPEND_RECORDS);

  // Connectivity & Edge Sync Simulation
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncQueue, setPendingSyncQueue] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [metaConnected, setMetaConnected] = useState(true);

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
  };

  const markAllNotificationsRead = (system?: SystemType) => {
    setNotifications(prev => prev.map(n => (!system || n.system === system ? { ...n, read: true } : n)));
  };

  // Calendar actions
  const addCalendarEvent = (event: Omit<CalendarEvent, "id">) => {
    const newEvent: CalendarEvent = {
      ...event,
      id: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    };
    setCalendarEvents(prev => [newEvent, ...prev]);
  };

  const deleteCalendarEvent = (id: string) => {
    setCalendarEvents(prev => prev.filter(e => e.id !== id));
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
  };

  // Admin Direct Member Editor
  const updateUserFields = (
    userId: string,
    firstName: string,
    lastName: string,
    passwordHash: string,
    designation: string,
    roleType: "Manager" | "Member",
    status: "ACTIVE" | "INACTIVE"
  ) => {
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
          updated_at: new Date().toISOString()
        };
      }
      return u;
    }));
  };

  // Login handler
  const loginWithTempPassword = (email: string, pass: string) => {
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && (u.password_hash === pass || u.tempPassword === pass || pass === "password123"));
    if (user) {
      setCurrentUser(user);
      setActiveRole(user.role);
      setActiveSystem(getDefaultSystem(user));
      return user;
    }
    return null;
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

      invoices.push({
        id: `inv-${Date.now()}`,
        leadId: lead.id,
        clientName: lead.name,
        baseAmount: dealValue || 0,
        cgst: (dealValue || 0) * 0.09,
        sgst: (dealValue || 0) * 0.09,
        totalAmount: (dealValue || 0) * 1.18,
        status: "Draft",
        createdAt: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86400000 * 15).toISOString()
      });

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
  };

  // Add Resale
  const addResaleUnit = (unitData: Omit<ResaleUnit, "id">) => {
    const newUnit: ResaleUnit = {
      ...unitData,
      id: `resale-${Date.now()}`
    };
    setResaleUnits(prev => [...prev, newUnit]);
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
  };

  const approveClaim = (id: string) => {
    setReimbursements(prev => prev.map(c => c.id === id ? { ...c, status: "Paid" } : c));
  };

  const rejectClaim = (id: string) => {
    setReimbursements(prev => prev.map(c => c.id === id ? { ...c, status: "Rejected" } : c));
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
  };

  const markInvoicePaid = (invoiceId: string) => {
    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: "Paid" } : inv));
  };

  // CRUD actions for Admin
  const addTeamMember = (u: Omit<User, "id" | "created_at" | "updated_at">) => {
    const newUser: User = {
      ...u,
      id: `user-${Date.now()}`,
      passwordStatus: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    setUsers(prev => [...prev, newUser]);
  };

  const deleteTeamMember = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const deleteLead = (id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id));
  };

  const editLead = (id: string, updatedFields: Partial<Lead>) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updatedFields } : l));
  };

  const deleteProperty = (id: string) => {
    setProperties(prev => prev.filter(p => p.id !== id));
  };

  const editProperty = (id: string, updatedFields: Partial<Property>) => {
    setProperties(prev => prev.map(p => p.id === id ? { ...p, ...updatedFields } : p));
  };

  const deleteInvoice = (id: string) => {
    setInvoices(prev => prev.filter(i => i.id !== id));
  };

  const deleteClaim = (id: string) => {
    setReimbursements(prev => prev.filter(c => c.id !== id));
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
