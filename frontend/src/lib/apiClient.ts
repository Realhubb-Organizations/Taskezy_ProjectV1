// Thin client for Taskezy-Server. Handles JWT storage/attachment and a
// one-shot refresh-and-retry on 401. See Taskezy-Server/README.md for the
// API's shape — every response is { success, data } or { success, data, meta }.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const ACCESS_TOKEN_STORAGE_KEY = "taskezy_access_token";

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  }
  return accessToken;
}

function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  else window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

export class ApiRequestError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: { page: number; pageSize: number; totalCount: number; totalPages: number };
  error?: { code: string; message: string };
}

async function request<T>(path: string, options: RequestInit = {}, allowRefreshRetry = true): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include", // sends the httpOnly refresh-token cookie
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  if (res.status === 401 && allowRefreshRetry && !path.startsWith("/api/v1/auth/")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, options, false);
  }

  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.success) {
    throw new ApiRequestError(res.status, json?.error?.message || "Request failed", json?.error?.code);
  }
  return json.data;
}

async function requestWithMeta<T>(path: string): Promise<{ data: T[]; meta: Envelope<T[]>["meta"] }> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  const json = (await res.json().catch(() => null)) as Envelope<T[]> | null;
  if (!res.ok || !json?.success) {
    throw new ApiRequestError(res.status, json?.error?.message || "Request failed", json?.error?.code);
  }
  return { data: json.data, meta: json.meta };
}

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) {
      setAccessToken(null);
      return false;
    }
    const json = await res.json();
    setAccessToken(json.data.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}

export interface ApiUser {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  role: "ADMIN" | "FINANCE" | "AGENT";
  department: string | null;
  role_type: string | null;
  designation: string | null;
  status: string;
}

export async function apiLogin(email: string, password: string): Promise<ApiUser> {
  const data = await request<{ accessToken: string; user: ApiUser }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  setAccessToken(data.accessToken);
  return data.user;
}

export async function apiLogout(): Promise<void> {
  try {
    await request("/api/v1/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}

export function apiGetMe(): Promise<ApiUser> {
  return request<ApiUser>("/api/v1/auth/me");
}

export function isApiSessionActive(): boolean {
  return getAccessToken() !== null;
}

export function clearApiSession(): void {
  setAccessToken(null);
}

export interface ApiLeadRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status_code: string;
  status_label: string;
  deal_value: string | null;
  lead_score: number | null;
  assigned_agent_id: string;
  assigned_agent_name: string;
  property_id: string | null;
  property_name: string | null;
  assigned_at: string | null;
  first_response_at: string | null;
  created_at: string;
  source: string | null;
  campaign: string | null;
  meta_page_name: string | null;
  meta_form_id: string | null;
  logs: { message: string; timestamp: string; user: string }[];
}

// Pages through every lead and concatenates the results, as a bridge until the
// frontend's filter/search UI (which currently assumes the full dataset is in
// memory) is reworked for real server-side pagination — see Taskezy-Server/README.md
// and the 2026-07-21+ IMPLEMENTATIONS.md entry for why. The server deliberately
// caps pageSize at 100 (see leads.schema.ts) — that's a real safety limit, not
// something to raise just to fetch everything in one request, so this loops
// instead. Fine at current data volume; revisit (build real pagination UI) once
// the lead count grows large enough that "fetch everything" stops being viable.
const MAX_PAGE_SIZE = 100;

export async function apiListAllLeads(): Promise<ApiLeadRow[]> {
  const all: ApiLeadRow[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, meta } = await requestWithMeta<ApiLeadRow>(`/api/v1/leads?page=${page}&pageSize=${MAX_PAGE_SIZE}`);
    all.push(...data);
    if (!meta || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
}

export function apiGetLead(leadId: string): Promise<ApiLeadRow> {
  return request<ApiLeadRow>(`/api/v1/leads/${leadId}`);
}

export interface CreateLeadApiInput {
  name: string;
  phone: string;
  email?: string;
  source?: string;
  campaign?: string;
  propertyId?: string;
  assignedAgentId: string;
}

export function apiCreateLead(input: CreateLeadApiInput): Promise<ApiLeadRow> {
  return request<ApiLeadRow>("/api/v1/leads", { method: "POST", body: JSON.stringify(input) });
}

export function apiUpdateLeadStatus(leadId: string, statusCode: string, dealValue?: number): Promise<ApiLeadRow> {
  return request<ApiLeadRow>(`/api/v1/leads/${leadId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ statusCode, dealValue })
  });
}

export interface EditLeadApiInput {
  name?: string;
  email?: string;
  source?: string;
  campaign?: string;
  propertyId?: string | null;
  leadScore?: number;
}

export function apiEditLead(leadId: string, input: EditLeadApiInput): Promise<ApiLeadRow> {
  return request<ApiLeadRow>(`/api/v1/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function apiReassignLead(leadId: string, newAgentId: string): Promise<ApiLeadRow> {
  return request<ApiLeadRow>(`/api/v1/leads/${leadId}/reassign`, {
    method: "PATCH",
    body: JSON.stringify({ newAgentId })
  });
}

export function apiDeleteLead(leadId: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/v1/leads/${leadId}`, { method: "DELETE" });
}

export function apiVerifyLeadKyc(leadId: string): Promise<ApiLeadRow> {
  return request<ApiLeadRow>(`/api/v1/leads/${leadId}/kyc`, { method: "PATCH" });
}

export interface ApiUserDirectoryEntry {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  role: string;
  department: string | null;
  role_type: string | null;
  designation: string | null;
  manager_id: string | null;
  manager_name: string | null;
}

export function apiListUsers(): Promise<ApiUserDirectoryEntry[]> {
  return request<ApiUserDirectoryEntry[]>("/api/v1/users");
}

export interface ApiFullUser extends ApiUserDirectoryEntry {
  phone_number: string | null;
  employment_type: string | null;
  status: string;
  created_at: string;
}

export interface CreateUserApiInput {
  firstName: string;
  lastName?: string;
  email: string;
  phoneNumber?: string;
  designation?: string;
  role: "ADMIN" | "FINANCE" | "AGENT";
  roleType?: "MANAGER" | "MEMBER";
  employmentType?: "FULL_TIME" | "FREELANCER" | "INTERN" | "AGENCY";
  department?: "SALES" | "TECH" | "MARKETING" | "FINANCE";
  managerId?: string;
  password: string;
}

export function apiCreateUser(input: CreateUserApiInput): Promise<ApiFullUser> {
  return request<ApiFullUser>("/api/v1/users", { method: "POST", body: JSON.stringify(input) });
}

export interface EditUserApiInput {
  firstName?: string;
  lastName?: string;
  designation?: string;
  roleType?: "MANAGER" | "MEMBER";
  department?: "SALES" | "TECH" | "MARKETING" | "FINANCE";
  status?: "ACTIVE" | "INACTIVE";
  managerId?: string | null;
}

export function apiEditUser(userId: string, input: EditUserApiInput): Promise<ApiFullUser> {
  return request<ApiFullUser>(`/api/v1/users/${userId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function apiResetUserPassword(userId: string, newPassword: string): Promise<{ passwordReset: boolean }> {
  return request<{ passwordReset: boolean }>(`/api/v1/users/${userId}/password`, {
    method: "PATCH",
    body: JSON.stringify({ newPassword })
  });
}

export function apiDeleteUser(userId: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/v1/users/${userId}`, { method: "DELETE" });
}

// --- Properties ---
export interface ApiPropertyRow {
  id: string;
  name: string;
  developer: string;
  location: string;
  locality: string | null;
  zone: string | null;
  price_value: string | null;
  price_type: "ABSOLUTE" | "STARTING_FROM" | null;
  property_type: string;
  property_status: string | null;
  description: string | null;
  possession_date: string | null;
  land_parcel: string | null;
  towers: string | null;
  structure: string | null;
  amenities: string[] | null;
  contact_number: string | null;
  map_url: string | null;
  website_url: string | null;
  brochure_url: string | null;
  lead_registration_url: string | null;
  tags: string[] | null;
  media_file_names: string[] | null;
  team_assignment_mode: "ALL_MEMBERS" | "CUSTOM_MEMBERS";
  lead_assignment_mode: "ROUND_ROBIN" | "PERCENTAGE" | null;
  created_at: string;
  team_members: { userId: string; name: string; percentage: number | null }[];
}
export function apiListProperties(): Promise<ApiPropertyRow[]> {
  return request<ApiPropertyRow[]>("/api/v1/properties");
}

export interface PropertyApiInput {
  name: string;
  developer: string;
  location: string;
  locality?: string;
  zone?: string;
  priceValue?: number;
  priceType?: "ABSOLUTE" | "STARTING_FROM";
  propertyType: string;
  propertyStatus?: string;
  description?: string;
  possessionDate?: string;
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
  teamAssignmentMode?: "ALL_MEMBERS" | "CUSTOM_MEMBERS";
  leadAssignmentMode?: "ROUND_ROBIN" | "PERCENTAGE";
}

export function apiCreateProperty(input: PropertyApiInput): Promise<ApiPropertyRow> {
  return request<ApiPropertyRow>("/api/v1/properties", { method: "POST", body: JSON.stringify(input) });
}

// Meta ad campaigns linked to a property — matched by campaign name against
// leads.campaign on real incoming Meta leads (see meta.lead-ingest.ts).
export function apiGetMetaCampaignSuggestions(): Promise<string[]> {
  return request<string[]>("/api/v1/properties/meta-campaign-suggestions");
}

export function apiGetPropertyMetaCampaigns(propertyId: string): Promise<string[]> {
  return request<string[]>(`/api/v1/properties/${propertyId}/meta-campaigns`);
}

export function apiSetPropertyMetaCampaigns(propertyId: string, campaignNames: string[]): Promise<string[]> {
  return request<string[]>(`/api/v1/properties/${propertyId}/meta-campaigns`, {
    method: "PUT",
    body: JSON.stringify({ campaignNames })
  });
}

export function apiSetPropertyTeamMembers(
  propertyId: string,
  members: { userId: string; percentage?: number }[]
): Promise<ApiPropertyRow> {
  return request<ApiPropertyRow>(`/api/v1/properties/${propertyId}/team-members`, {
    method: "PUT",
    body: JSON.stringify({ members })
  });
}

export function apiEditProperty(propertyId: string, input: Partial<PropertyApiInput>): Promise<ApiPropertyRow> {
  return request<ApiPropertyRow>(`/api/v1/properties/${propertyId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function apiDeleteProperty(propertyId: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/v1/properties/${propertyId}`, { method: "DELETE" });
}

// --- Resale units ---
export interface ApiResaleUnitRow {
  id: string;
  property_name: string;
  builder: string | null;
  location: string | null;
  price: string | null;
  description: string | null;
  listed_by: string | null;
}
export function apiListResaleUnits(): Promise<ApiResaleUnitRow[]> {
  return request<ApiResaleUnitRow[]>("/api/v1/resale-units");
}

export interface CreateResaleUnitApiInput {
  propertyName: string;
  builder?: string;
  location?: string;
  price?: string;
  description?: string;
  listedBy?: string;
}

export function apiCreateResaleUnit(input: CreateResaleUnitApiInput): Promise<ApiResaleUnitRow> {
  return request<ApiResaleUnitRow>("/api/v1/resale-units", { method: "POST", body: JSON.stringify(input) });
}

// --- Followups ---
export interface ApiFollowupRow {
  id: string;
  scheduled_at: string;
  status: "MISSED" | "UPCOMING" | "COMPLETED";
  lead_id: string | null;
  lead_name: string;
  phone: string | null;
  call_type: "CALLBACK" | "MEETING" | "SITE_VISIT";
  assigned_to_id: string;
  assigned_to_name: string;
  due_notified_at: string | null;
  violation_notified_at: string | null;
}
export function apiListFollowups(): Promise<ApiFollowupRow[]> {
  return request<ApiFollowupRow[]>("/api/v1/followups");
}

export interface CreateFollowupApiInput {
  scheduledAt: string;
  leadId?: string;
  leadName: string;
  phone?: string;
  callType: "CALLBACK" | "MEETING" | "SITE_VISIT";
  assignedToId: string;
}

export function apiCreateFollowup(input: CreateFollowupApiInput): Promise<ApiFollowupRow> {
  return request<ApiFollowupRow>("/api/v1/followups", { method: "POST", body: JSON.stringify(input) });
}

// --- Attendance (derived view) ---
export interface ApiAttendanceRow {
  user_id: string;
  employee_name: string;
  email: string;
  designation: string | null;
  present_days: string;
  total_days: string;
  on_time_days: string;
  late_days: string;
}
export function apiListAttendance(): Promise<ApiAttendanceRow[]> {
  return request<ApiAttendanceRow[]>("/api/v1/attendance");
}

// --- Reimbursement claims ---
export interface ApiReimbursementRow {
  id: string;
  title: string;
  claim_type: string;
  amount: string;
  status: "PENDING" | "PAID" | "REJECTED";
  claim_date: string;
  agent_id: string;
  agent_name: string;
  notes: string | null;
}
export function apiListReimbursements(): Promise<ApiReimbursementRow[]> {
  return request<ApiReimbursementRow[]>("/api/v1/reimbursements");
}

export interface CreateReimbursementApiInput {
  title: string;
  claimType: string;
  amount: number;
  notes?: string;
}

export function apiCreateReimbursement(input: CreateReimbursementApiInput): Promise<ApiReimbursementRow> {
  return request<ApiReimbursementRow>("/api/v1/reimbursements", { method: "POST", body: JSON.stringify(input) });
}

export function apiApproveReimbursement(claimId: string): Promise<ApiReimbursementRow> {
  return request<ApiReimbursementRow>(`/api/v1/reimbursements/${claimId}/approve`, { method: "PATCH" });
}

export function apiRejectReimbursement(claimId: string): Promise<ApiReimbursementRow> {
  return request<ApiReimbursementRow>(`/api/v1/reimbursements/${claimId}/reject`, { method: "PATCH" });
}

export function apiDeleteReimbursement(claimId: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/v1/reimbursements/${claimId}`, { method: "DELETE" });
}

// --- Invoices ---
export interface ApiInvoiceRow {
  id: string;
  invoice_number: string | null;
  lead_id: string;
  client_name: string;
  base_amount: string;
  cgst: string;
  sgst: string;
  total_amount: string;
  status: "DRAFT" | "PAID" | "OVERDUE";
  due_date: string;
  developer_name: string | null;
  project_name: string | null;
  unit_no: string | null;
  unit_dimension: string | null;
  brokerage_type: "PERCENTAGE" | "FLAT" | null;
  brokerage_rate: string | null;
  collection_status: "PENDING" | "PARTIALLY_COLLECTED" | "COLLECTED";
  collected_amount: string;
  created_at: string;
}
export function apiListInvoices(): Promise<ApiInvoiceRow[]> {
  return request<ApiInvoiceRow[]>("/api/v1/invoices");
}

export interface CreateInvoiceApiInput {
  leadId: string;
  clientName: string;
  baseAmount: number;
  dueDate?: string;
  developerName?: string;
  projectName?: string;
  unitNo?: string;
  unitDimension?: string;
  brokerageType?: "PERCENTAGE" | "FLAT";
  brokerageRate?: number;
}

export function apiCreateInvoice(input: CreateInvoiceApiInput): Promise<ApiInvoiceRow> {
  return request<ApiInvoiceRow>("/api/v1/invoices", { method: "POST", body: JSON.stringify(input) });
}

export function apiGenerateInvoice(invoiceId: string): Promise<ApiInvoiceRow> {
  return request<ApiInvoiceRow>(`/api/v1/invoices/${invoiceId}/generate`, { method: "PATCH" });
}

export function apiMarkInvoicePaid(invoiceId: string): Promise<ApiInvoiceRow> {
  return request<ApiInvoiceRow>(`/api/v1/invoices/${invoiceId}/mark-paid`, { method: "PATCH" });
}

export function apiDeleteInvoice(invoiceId: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/v1/invoices/${invoiceId}`, { method: "DELETE" });
}

// --- Notifications ---
export interface ApiNotificationRow {
  id: string;
  system: "CRM" | "HRMS" | "FINANCE" | "ADMIN";
  category: string;
  title: string;
  message: string;
  read: boolean;
  lead_id: string | null;
  link: string | null;
  created_at: string;
}
export function apiListNotifications(): Promise<ApiNotificationRow[]> {
  return request<ApiNotificationRow[]>("/api/v1/notifications");
}

export function apiMarkNotificationRead(notificationId: string): Promise<{ read: boolean }> {
  return request<{ read: boolean }>(`/api/v1/notifications/${notificationId}/read`, { method: "PATCH" });
}

export function apiMarkAllNotificationsRead(system?: "CRM" | "HRMS" | "FINANCE" | "ADMIN"): Promise<{ read: boolean }> {
  const query = system ? `?system=${system}` : "";
  return request<{ read: boolean }>(`/api/v1/notifications/read-all${query}`, { method: "PATCH" });
}

// EventSource can't set an Authorization header, so the access token travels
// as a query param on this one endpoint (see notifications.routes.ts).
// Returns null when there's no session yet — caller should not open a stream.
export function getNotificationStreamUrl(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  return `${API_BASE_URL}/api/v1/notifications/stream?access_token=${encodeURIComponent(token)}`;
}

// --- Calendar events ---
export interface ApiCalendarEventRow {
  id: string;
  system: "CRM" | "HRMS" | "FINANCE" | "ADMIN";
  event_type: string;
  title: string;
  event_date: string;
  event_time: string | null;
  description: string | null;
  lead_id: string | null;
  created_by_id: string | null;
  created_by_name: string | null;
  amount: string | null;
  attendee_names: string[];
}
export function apiListCalendarEvents(): Promise<ApiCalendarEventRow[]> {
  return request<ApiCalendarEventRow[]>("/api/v1/calendar-events");
}

export interface CreateCalendarEventApiInput {
  system: "CRM" | "HRMS" | "FINANCE" | "ADMIN";
  eventType: "SITE_VISIT" | "FOLLOWUP" | "BOOKING" | "EOI" | "HOLIDAY" | "ABSENCE" | "ADMIN_EVENT" | "PAYMENT_REMINDER" | "TASK";
  title: string;
  date: string;
  time?: string;
  description?: string;
  leadId?: string;
  amount?: number;
  attendeeUserIds?: string[];
}

export function apiCreateCalendarEvent(input: CreateCalendarEventApiInput): Promise<ApiCalendarEventRow> {
  return request<ApiCalendarEventRow>("/api/v1/calendar-events", { method: "POST", body: JSON.stringify(input) });
}

export function apiDeleteCalendarEvent(eventId: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/v1/calendar-events/${eventId}`, { method: "DELETE" });
}

// --- Ad spend ---
export interface ApiAdSpendRow {
  id: string;
  platform: "META" | "GOOGLE";
  account_name: string;
  property_id: string | null;
  property_name: string | null;
  spend_date: string;
  spend: string;
  leads_generated: number;
  campaign_status: "ACTIVE" | "INACTIVE" | null;
}
export function apiListAdSpend(): Promise<ApiAdSpendRow[]> {
  return request<ApiAdSpendRow[]>("/api/v1/ad-spend");
}

// --- Meta (Facebook/Instagram) Lead Ads connection — ADMIN only ---
export interface ApiMetaConnection {
  id: string;
  page_id: string;
  page_name: string;
  ad_account_id: string | null;
  status: "ACTIVE" | "DISCONNECTED";
  connected_by: string;
  created_at: string;
}

export function apiListMetaConnections(): Promise<ApiMetaConnection[]> {
  return request<ApiMetaConnection[]>("/api/v1/meta/connections");
}

// Returns the Meta OAuth dialog URL — the caller navigates the browser there
// itself (window.location.href), since a plain page navigation can't carry
// this request's Authorization header.
export function apiGetMetaConnectUrl(): Promise<{ url: string }> {
  return request<{ url: string }>("/api/v1/meta/connect");
}

export function apiDisconnectMeta(connectionId: string): Promise<{ disconnected: boolean }> {
  return request<{ disconnected: boolean }>(`/api/v1/meta/connections/${connectionId}`, { method: "DELETE" });
}

// --- Timesheets (HRMS punch in/out + regularization) ---
export interface ApiTimesheetRow {
  id: string;
  user_id: string;
  user_name: string;
  work_date: string;
  punch_in: string;
  punch_out: string | null;
  punch_in_lat: string | null;
  punch_in_lng: string | null;
  duration_hours: string | null;
  status: "FULL_DAY" | "HALF_DAY" | "REGULARIZATION_PENDING" | "REGULARIZED";
  regularization_id: string | null;
  requested_in: string | null;
  requested_out: string | null;
  reason: string | null;
  submitted_at: string | null;
}

export function apiListTimesheets(): Promise<ApiTimesheetRow[]> {
  return request<ApiTimesheetRow[]>("/api/v1/timesheets");
}

export function apiPunchIn(lat: number, lng: number): Promise<ApiTimesheetRow> {
  return request<ApiTimesheetRow>("/api/v1/timesheets/punch-in", { method: "POST", body: JSON.stringify({ lat, lng }) });
}

export function apiPunchOut(): Promise<ApiTimesheetRow> {
  return request<ApiTimesheetRow>("/api/v1/timesheets/punch-out", { method: "PATCH" });
}

export function apiSubmitRegularization(
  timesheetId: string,
  requestedIn: string,
  requestedOut: string,
  reason: string
): Promise<ApiTimesheetRow> {
  return request<ApiTimesheetRow>(`/api/v1/timesheets/${timesheetId}/regularize`, {
    method: "POST",
    body: JSON.stringify({ requestedIn, requestedOut, reason })
  });
}

export function apiApproveRegularization(timesheetId: string): Promise<ApiTimesheetRow> {
  return request<ApiTimesheetRow>(`/api/v1/timesheets/${timesheetId}/regularize/approve`, { method: "PATCH" });
}

export function apiRejectRegularization(timesheetId: string): Promise<ApiTimesheetRow> {
  return request<ApiTimesheetRow>(`/api/v1/timesheets/${timesheetId}/regularize/reject`, { method: "PATCH" });
}
