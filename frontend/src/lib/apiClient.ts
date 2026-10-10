// Thin client for Taskezy-Server. Handles JWT storage/attachment and a
// one-shot refresh-and-retry on 401. See Taskezy-Server/README.md for the
// API's shape — every response is { success, data } or { success, data, meta }.

// Type-only import — erased at compile time, so this can't create a runtime
// circular dependency even though leadSummaryStats.ts itself imports a type
// from AppContext.tsx, which imports functions from this very file.
import type { LeadSummaryStats } from "@/lib/leadSummaryStats";

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
  error?: { code: string; message: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> } };
}

// A validation refusal's message is just "Invalid request"; show the first
// field-specific reason instead (e.g. "Password must be at least 8 characters").
function errorMessageOf(error: Envelope<unknown>["error"] | undefined): string {
  const details = error?.details;
  const fieldMessage = details?.fieldErrors && Object.values(details.fieldErrors).find(m => m && m.length)?.[0];
  return fieldMessage || details?.formErrors?.[0] || error?.message || "Request failed";
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
    throw new ApiRequestError(res.status, errorMessageOf(json?.error), json?.error?.code);
  }
  return json.data;
}

async function requestWithMeta<T>(path: string, allowRefreshRetry = true): Promise<{ data: T[]; meta: Envelope<T[]>["meta"] }> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });

  // Unlike request() above, this had no refresh-and-retry at all — an
  // expired token meant apiListAllLeads's page loop (the only caller)
  // threw outright instead of transparently refreshing, same bug class as
  // the de-duplicated refreshAccessToken() above just for a different code
  // path.
  if (res.status === 401 && allowRefreshRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return requestWithMeta<T>(path, false);
  }

  const json = (await res.json().catch(() => null)) as Envelope<T[]> | null;
  if (!res.ok || !json?.success) {
    throw new ApiRequestError(res.status, errorMessageOf(json?.error), json?.error?.code);
  }
  return { data: json.data, meta: json.meta };
}

// loadAllRealData fires ~14 requests in parallel; if the access token has
// expired, every single one of them independently hits a 401 and would
// otherwise each call this to refresh — up to 14 simultaneous POSTs to
// /auth/refresh from one page load. If the refresh token rotates on use
// (single-use), only the first of those to land actually succeeds; the
// rest race against an already-invalidated token and fail with their own
// 401, and that same burst is often enough on its own to trip the auth
// rate limiter (see rateLimiter.ts). Sharing one in-flight promise across
// every concurrent caller means only one real network call ever happens no
// matter how many requests hit a 401 at once — everyone else just awaits
// the same result.
let refreshPromise: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
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
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
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
  previous_agent_name: string | null;
  notes: string | null;
  notes_updated_at: string | null;
  notes_updated_by_name: string | null;
  reassigned_at: string | null;
  property_id: string | null;
  property_name: string | null;
  assigned_at: string | null;
  first_response_at: string | null;
  created_at: string;
  source: string | null;
  campaign: string | null;
  meta_page_name: string | null;
  meta_form_id: string | null;
  meta_ad_id: string | null;
  // Free-text batch label set at bulk-upload time (e.g. "Kashmiri Data") —
  // null for every other ingestion path. See ApiBulkImportLeadsInput.
  sub_source: string | null;
  // Data Calling's Connected sub-status ("Qualified" | "Not Qualified") —
  // null whenever status_code isn't CONNECTED, or for any lead that was
  // never a Data Calling lead.
  sub_status: string | null;
  logs: { message: string; timestamp: string; user: string }[];
}

// Pages through every lead and concatenates the results, as a bridge until the
// frontend's filter/search UI (which currently assumes the full dataset is in
// memory) is reworked for real server-side pagination — see Taskezy-Server/README.md
// and the 2026-07-21+ IMPLEMENTATIONS.md entry for why. The server deliberately
// caps pageSize at 500 (see leads.schema.ts) — that's a real safety limit, not
// something to raise just to fetch everything in one request, so this loops
// instead; 500 (not the old 100) keeps that loop to a reasonable handful of
// round trips at this system's current ~9k leads instead of ~90+. Now runs
// in the background after login/session-restore rather than blocking either
// (see AppContext's isDataLoading) — revisit (build real per-page
// server-side pagination) once the lead count grows enough that even a
// background "fetch everything" stops being viable.
const MAX_PAGE_SIZE = 500;

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

// Real server-side pagination for the admin Leads table — the thing the
// comment above this function was always meant to be replaced by once the
// "fetch everything" loop stopped being viable. Mirrors
// leads.schema.ts's listLeadsQuerySchema exactly: status/assignedAgentId/
// campaign are repeated-query-param multi-selects, dateFrom/dateTo are
// plain YYYY-MM-DD bounds the caller computes from whichever date-range
// preset is active, search is a single string (name/phone ILIKE).
export interface LeadListFilters {
  status?: string[];
  assignedAgentId?: string[];
  campaign?: string[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** Leave out Data Calling ("Bulk Upload") leads. */
  excludeBulkUpload?: boolean;
}

function buildLeadFilterParams(filters: LeadListFilters): URLSearchParams {
  const params = new URLSearchParams();
  filters.status?.forEach(s => params.append("status", s));
  filters.assignedAgentId?.forEach(a => params.append("assignedAgentId", a));
  filters.campaign?.forEach(c => params.append("campaign", c));
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.search) params.set("search", filters.search);
  if (filters.excludeBulkUpload) params.set("excludeBulkUpload", "true");
  return params;
}

export interface LeadsPageResult {
  rows: ApiLeadRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export async function apiListLeadsPage(
  page: number,
  pageSize: number,
  filters: LeadListFilters = {}
): Promise<LeadsPageResult> {
  const params = buildLeadFilterParams(filters);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const { data, meta } = await requestWithMeta<ApiLeadRow>(`/api/v1/leads?${params.toString()}`);
  return {
    rows: data,
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? pageSize,
    totalCount: meta?.totalCount ?? data.length,
    totalPages: meta?.totalPages ?? 1
  };
}

// Same filter shape as apiListLeadsPage, matching leads.schema.ts's
// leadStatsQuerySchema (identical filters, no page/pageSize — an aggregate
// has no "page"). Lets the admin Leads tab's 7 stat cards reflect the
// currently-applied filters without needing the full lead list in memory.
export function apiGetLeadStats(filters: LeadListFilters = {}): Promise<LeadSummaryStats> {
  const params = buildLeadFilterParams(filters);
  const qs = params.toString();
  return request<LeadSummaryStats>(`/api/v1/leads/stats${qs ? `?${qs}` : ""}`);
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

// Admin CRM Data Calling's bulk Excel upload (Name + Mobile Number only) —
// ADMIN-only. Property mode distributes rows across that property's
// configured Round Robin/Percentage team; Agent mode round-robins rows
// evenly across every selected agent. See Taskezy-Server/leads.service.ts's
// bulkImportLeads for the full assignment/fallback logic.
export interface BulkImportLeadsApiInput {
  subSource: string;
  assignmentMode: "PROPERTY" | "AGENT";
  propertyId?: string;
  agentIds?: string[];
  leads: { name: string; phone: string }[];
}
export interface BulkImportLeadsApiResult {
  created: number;
  duplicates: number;
  skipped: { row: number; reason: string }[];
}
export function apiBulkImportLeads(input: BulkImportLeadsApiInput): Promise<BulkImportLeadsApiResult> {
  return request<BulkImportLeadsApiResult>("/api/v1/leads/bulk-import", { method: "POST", body: JSON.stringify(input) });
}

export function apiUpdateLeadStatus(
  leadId: string,
  statusCode: string,
  dealValue?: number,
  subStatus?: "Qualified" | "Not Qualified"
): Promise<ApiLeadRow> {
  return request<ApiLeadRow>(`/api/v1/leads/${leadId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ statusCode, dealValue, subStatus })
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

export function apiReassignLead(leadId: string, newAgentId: string, note: string): Promise<ApiLeadRow> {
  return request<ApiLeadRow>(`/api/v1/leads/${leadId}/reassign`, {
    method: "PATCH",
    body: JSON.stringify({ newAgentId, note })
  });
}

export function apiUpdateLeadNote(leadId: string, note: string): Promise<ApiLeadRow> {
  return request<ApiLeadRow>(`/api/v1/leads/${leadId}/notes`, {
    method: "PATCH",
    body: JSON.stringify({ note })
  });
}

export function apiDeleteLead(leadId: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/v1/leads/${leadId}`, { method: "DELETE" });
}

export function apiBulkDeleteLeads(leadIds: string[]): Promise<{
  requested: number;
  deleted: number;
  notFound: number;
  blocked: { id: string; reason: string }[];
}> {
  return request<{
    requested: number;
    deleted: number;
    notFound: number;
    blocked: { id: string; reason: string }[];
  }>("/api/v1/leads/bulk-delete", { method: "POST", body: JSON.stringify({ leadIds }) });
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

// Real server-side pagination for the admin Settings "Manage Users" table —
// mirrors apiListLeadsPage's shape. Passing page/pageSize is what opts the
// backend into the paginated response at all (see users.routes.ts); every
// other consumer of users (dropdowns, name resolution, AppContext's bulk
// load) keeps calling the bare apiListUsers() above and is untouched.
export interface UserListFilters {
  search?: string;
  /** CRM Manage Users stat card filter. */
  group?: "crm" | "admin" | "sales-managers" | "sales-agents";
}

export interface UsersPageResult {
  rows: ApiUserDirectoryEntry[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export async function apiListUsersPage(
  page: number,
  pageSize: number,
  filters: UserListFilters = {}
): Promise<UsersPageResult> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (filters.search) params.set("search", filters.search);
  if (filters.group) params.set("group", filters.group);
  const { data, meta } = await requestWithMeta<ApiUserDirectoryEntry>(`/api/v1/users?${params.toString()}`);
  return {
    rows: data,
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? pageSize,
    totalCount: meta?.totalCount ?? data.length,
    totalPages: meta?.totalPages ?? 1
  };
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

/** Leads a user still holds (the delete dialog asks who gets them when > 0) and who reports to them. */
export function apiGetUserDeleteImpact(userId: string): Promise<{ leadCount: number; reportNames: string[] }> {
  return request<{ leadCount: number; reportNames: string[] }>(`/api/v1/users/${userId}/delete-impact`);
}

/** Deletes a user; one who still holds leads needs `handover` (members round-robin + required note). */
export function apiDeleteUser(
  userId: string,
  handover?: { reassignTo: string[]; note: string }
): Promise<{ deleted: boolean; reassignedLeads?: number }> {
  return request<{ deleted: boolean; reassignedLeads?: number }>(`/api/v1/users/${userId}`, {
    method: "DELETE",
    ...(handover ? { body: JSON.stringify(handover) } : {})
  });
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
// Server caps pageSize at 500 (see properties.schema.ts) — a real safety
// limit, not something to raise just to fetch everything in one request.
const MAX_PROPERTY_PAGE_SIZE = 500;

// Pages through every property and concatenates the results — the same
// "fetch everything" bridge apiListAllLeads is for leads, kept for
// AppContext's bulk load, which other features (AddLeadModal's property
// picker, LeadDashboard's property filter, AddPropertyModal) still read as
// one full array. Properties are headcount/inventory-bounded (far smaller
// than leads), so this is expected to resolve in a single round trip in
// practice; it still loops instead of assuming that, so it keeps working
// if that ever stops being true.
export async function apiListProperties(): Promise<ApiPropertyRow[]> {
  const all: ApiPropertyRow[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, meta } = await requestWithMeta<ApiPropertyRow>(`/api/v1/properties?page=${page}&pageSize=${MAX_PROPERTY_PAGE_SIZE}`);
    all.push(...data);
    if (!meta || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
}

// Real server-side pagination for the admin Properties table — mirrors
// apiListLeadsPage's shape. search matches name/developer/location;
// propertyType is a repeated-query-param multi-select matching ANY of a
// property's own (comma-joined) types; sortDir controls created_at order.
export interface PropertyListFilters {
  search?: string;
  propertyType?: string[];
  sortDir?: "asc" | "desc";
}

function buildPropertyFilterParams(filters: PropertyListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  filters.propertyType?.forEach(t => params.append("propertyType", t));
  if (filters.sortDir) params.set("sortDir", filters.sortDir);
  return params;
}

export interface PropertiesPageResult {
  rows: ApiPropertyRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export async function apiListPropertiesPage(
  page: number,
  pageSize: number,
  filters: PropertyListFilters = {}
): Promise<PropertiesPageResult> {
  const params = buildPropertyFilterParams(filters);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const { data, meta } = await requestWithMeta<ApiPropertyRow>(`/api/v1/properties?${params.toString()}`);
  return {
    rows: data,
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? pageSize,
    totalCount: meta?.totalCount ?? data.length,
    totalPages: meta?.totalPages ?? 1
  };
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

// Google ad campaigns linked to a property — same name-matching idea as Meta,
// except suggestions come from the synced google_ads_campaigns cache (no
// lead-ingest webhook for Google, spend-sync only).
export function apiGetGoogleCampaignSuggestions(): Promise<string[]> {
  return request<string[]>("/api/v1/properties/google-campaign-suggestions");
}

export function apiGetPropertyGoogleCampaigns(propertyId: string): Promise<string[]> {
  return request<string[]>(`/api/v1/properties/${propertyId}/google-campaigns`);
}

export function apiSetPropertyGoogleCampaigns(propertyId: string, campaignNames: string[]): Promise<string[]> {
  return request<string[]>(`/api/v1/properties/${propertyId}/google-campaigns`, {
    method: "PUT",
    body: JSON.stringify({ campaignNames })
  });
}

// --- Google Ads lead-form sheet linking (see modules/sheet-import) ---
// Same shape as the Meta/Google campaign linking above, except suggestions
// come from every sheet source name actually seen on an incoming lead (no
// sync job auto-discovers these the way ad campaigns get discovered).
export function apiGetSheetSourceSuggestions(): Promise<string[]> {
  return request<string[]>("/api/v1/properties/sheet-source-suggestions");
}

export function apiGetPropertySheetSources(propertyId: string): Promise<string[]> {
  return request<string[]>(`/api/v1/properties/${propertyId}/sheet-sources`);
}

export function apiSetPropertySheetSources(propertyId: string, sheetSourceNames: string[]): Promise<string[]> {
  return request<string[]>(`/api/v1/properties/${propertyId}/sheet-sources`, {
    method: "PUT",
    body: JSON.stringify({ sheetSourceNames })
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
// Server caps pageSize at 500 (see resale-units.routes.ts) — a real safety
// limit, not something to raise just to fetch everything in one request.
const MAX_RESALE_UNIT_PAGE_SIZE = 500;

// Pages through every resale unit and concatenates the results — same
// "fetch everything" bridge as apiListProperties, kept for AppContext's bulk
// load (other features read the full resaleUnits array from context).
export async function apiListResaleUnits(): Promise<ApiResaleUnitRow[]> {
  const all: ApiResaleUnitRow[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, meta } = await requestWithMeta<ApiResaleUnitRow>(`/api/v1/resale-units?page=${page}&pageSize=${MAX_RESALE_UNIT_PAGE_SIZE}`);
    all.push(...data);
    if (!meta || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
}

// Real server-side pagination for the admin Resale Units table — mirrors
// apiListLeadsPage's shape. search matches property/builder/location,
// builder matches the page's existing Builder dropdown exactly ("All" means
// omit this field entirely).
export interface ResaleUnitListFilters {
  search?: string;
  builder?: string;
}

function buildResaleUnitFilterParams(filters: ResaleUnitListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.builder) params.set("builder", filters.builder);
  return params;
}

export interface ResaleUnitsPageResult {
  rows: ApiResaleUnitRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export async function apiListResaleUnitsPage(
  page: number,
  pageSize: number,
  filters: ResaleUnitListFilters = {}
): Promise<ResaleUnitsPageResult> {
  const params = buildResaleUnitFilterParams(filters);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const { data, meta } = await requestWithMeta<ApiResaleUnitRow>(`/api/v1/resale-units?${params.toString()}`);
  return {
    rows: data,
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? pageSize,
    totalCount: meta?.totalCount ?? data.length,
    totalPages: meta?.totalPages ?? 1
  };
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
// Pages through every follow-up and concatenates the results — same bridge
// pattern as apiListAllLeads, now that GET /followups has real LIMIT/OFFSET
// pagination (see followups.routes.ts) instead of one unbounded SELECT.
// Still the right shape for AppContext's bulk load: TeamTasksTable/
// SalesPendingTasksTable's buildSalesPendingTasks merges followupCalls with
// leads and buckets them by elapsed time (missed/pending/upcoming), which
// needs the *whole* dataset in memory to compute correctly — it can't be
// switched to a single fetched page without reimplementing that time-bucket
// logic server-side, so this keeps delivering the full array exactly as
// apiListFollowups() always did, just via capped page-sized round trips.
export async function apiListFollowups(): Promise<ApiFollowupRow[]> {
  const all: ApiFollowupRow[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, meta } = await requestWithMeta<ApiFollowupRow>(`/api/v1/followups?page=${page}&pageSize=${MAX_PAGE_SIZE}`);
    all.push(...data);
    if (!meta || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
}

// Real server-side pagination for a dedicated, specifically-filtered
// followups list — not used by the dashboard's merged task queues (see
// apiListFollowups above) but available for any future table that renders
// raw follow-up rows (e.g. a single-status "Upcoming" or "Missed" list)
// instead of the derived, cross-referenced task view. Mirrors
// followups.schema's listFollowupsQuerySchema: `status` is a repeated-query-
// param multi-select over MISSED/UPCOMING/COMPLETED.
export interface FollowupListFilters {
  status?: ("MISSED" | "UPCOMING" | "COMPLETED")[];
}

export interface FollowupsPageResult {
  rows: ApiFollowupRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export async function apiListFollowupsPage(
  page: number,
  pageSize: number,
  filters: FollowupListFilters = {}
): Promise<FollowupsPageResult> {
  const params = new URLSearchParams();
  filters.status?.forEach(s => params.append("status", s));
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const { data, meta } = await requestWithMeta<ApiFollowupRow>(`/api/v1/followups?${params.toString()}`);
  return {
    rows: data,
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? pageSize,
    totalCount: meta?.totalCount ?? data.length,
    totalPages: meta?.totalPages ?? 1
  };
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

// --- Call/WhatsApp attempts (mandatory post-contact feedback gate) ---
// CALL: native app only, closed by the real call-state plugin. WHATSAPP:
// web + app, closed by "did you send it?" self-report (no send-state API
// exists for WhatsApp on any platform). Same table/gate either way — see
// Taskezy-Server/migrations-archive/025_call_attempts.sql.
export interface ApiCallAttemptRow {
  id: string;
  lead_id: string;
  caller_user_id: string;
  channel: "CALL" | "WHATSAPP";
  started_at: string | null;
  ended_at: string;
  duration_seconds: number | null;
  status: "PENDING_FEEDBACK" | "COMPLETED";
  outcome: string | null;
  notes: string | null;
  created_at: string;
}

// CALL: called the moment the native call-state listener fires "call
// ended" — before the blocking feedback modal even renders, so the
// PENDING_FEEDBACK row exists even if the app is force-quit right after the
// call. WHATSAPP: called the moment the agent returns to Taskezy after the
// WhatsApp button opened wa.me.
export function apiCreateCallAttempt(input: { leadId: string; channel: "CALL" | "WHATSAPP"; startedAt?: string; durationSeconds?: number }): Promise<ApiCallAttemptRow> {
  return request<ApiCallAttemptRow>("/api/v1/call-attempts", { method: "POST", body: JSON.stringify(input) });
}

// Checked once on every app load/session-restore so the gate re-appears
// after a force-quit/relaunch, not just within the same in-memory session.
export function apiGetPendingCallAttempt(): Promise<ApiCallAttemptRow | null> {
  return request<ApiCallAttemptRow | null>("/api/v1/call-attempts/pending");
}

export function apiSubmitCallFeedback(id: string, input: { outcome: string; notes: string }): Promise<ApiCallAttemptRow> {
  return request<ApiCallAttemptRow>(`/api/v1/call-attempts/${id}`, { method: "PATCH", body: JSON.stringify(input) });
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
// Server caps pageSize at 500 (see attendance.schema.ts) — a real safety
// limit, not something to raise just to fetch everything in one request.
const MAX_ATTENDANCE_PAGE_SIZE = 500;

// Pages through every attendance_view row and concatenates the results —
// same "fetch everything" bridge as apiListAllLeads/apiListResaleUnits, kept
// for AppContext's bulk load (other features, e.g. home/page.tsx's simple
// counts, read the full attendanceRecords array from context). The HRMS
// page's own attendance report table uses apiListAttendancePage below
// instead, which fetches exactly one page at a time.
export async function apiListAttendance(): Promise<ApiAttendanceRow[]> {
  const all: ApiAttendanceRow[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, meta } = await requestWithMeta<ApiAttendanceRow>(`/api/v1/attendance?page=${page}&pageSize=${MAX_ATTENDANCE_PAGE_SIZE}`);
    all.push(...data);
    if (!meta || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
}

// Real server-side pagination for the HRMS attendance report table — mirrors
// apiListLeadsPage. attendance_view has no filters today (just a page/size
// over every employee's tally, ordered by employee_name), so this skips the
// filters param apiListLeadsPage carries.
export interface AttendancePageResult {
  rows: ApiAttendanceRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export async function apiListAttendancePage(page: number, pageSize: number): Promise<AttendancePageResult> {
  const { data, meta } = await requestWithMeta<ApiAttendanceRow>(`/api/v1/attendance?page=${page}&pageSize=${pageSize}`);
  return {
    rows: data,
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? pageSize,
    totalCount: meta?.totalCount ?? data.length,
    totalPages: meta?.totalPages ?? 1
  };
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

export interface ReimbursementListFilters {
  status?: "PENDING" | "PAID" | "REJECTED";
}

export interface ReimbursementsPageResult {
  rows: ApiReimbursementRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

// Real server-side pagination for the Finance page's Reimbursements tab —
// same shape as apiListLeadsPage, mirroring reimbursements.routes.ts's
// listReimbursementsQuerySchema (page/pageSize/status).
export async function apiListReimbursementsPage(
  page: number,
  pageSize: number,
  filters: ReimbursementListFilters = {}
): Promise<ReimbursementsPageResult> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (filters.status) params.set("status", filters.status);
  const { data, meta } = await requestWithMeta<ApiReimbursementRow>(`/api/v1/reimbursements?${params.toString()}`);
  return {
    rows: data,
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? pageSize,
    totalCount: meta?.totalCount ?? data.length,
    totalPages: meta?.totalPages ?? 1
  };
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

export interface InvoicesPageResult {
  rows: ApiInvoiceRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

// Real server-side pagination for the Finance page's Billing tab — same
// shape as apiListLeadsPage, mirroring invoices.routes.ts's
// listInvoicesQuerySchema (page/pageSize only — the Billing tab has no
// filter UI to mirror server-side).
export async function apiListInvoicesPage(page: number, pageSize: number): Promise<InvoicesPageResult> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const { data, meta } = await requestWithMeta<ApiInvoiceRow>(`/api/v1/invoices?${params.toString()}`);
  return {
    rows: data,
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? pageSize,
    totalCount: meta?.totalCount ?? data.length,
    totalPages: meta?.totalPages ?? 1
  };
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
// Pages through every notification and concatenates the results — same
// bridge pattern as apiListAllLeads/apiListFollowups, now that GET
// /notifications has real LIMIT/OFFSET pagination (see notifications.routes.ts)
// instead of one unbounded SELECT. notifications is one of the fastest-
// growing, zero-cap tables in this schema (broadcast rows accumulate
// forever for every user). Counts give the bell its unread badge and tab totals
// without downloading any notification rows.
export interface NotificationCounts {
  unreadBySystem: { CRM: number; HRMS: number; FINANCE: number };
  groups: { newLeads: number; reminders: number; activity: number; hrms: number; finance: number };
}

export function apiGetNotificationCounts(): Promise<NotificationCounts> {
  return request<NotificationCounts>("/api/v1/notifications/counts");
}

// Phone push tokens, for notifications while the app is closed or locked.
export function apiRegisterDevice(token: string, platform: "android" | "ios" = "android"): Promise<{ registered: boolean }> {
  return request<{ registered: boolean }>("/api/v1/devices", { method: "POST", body: JSON.stringify({ token, platform }) });
}

export function apiRemoveDevice(token: string): Promise<{ removed: boolean }> {
  return request<{ removed: boolean }>(`/api/v1/devices/${encodeURIComponent(token)}`, { method: "DELETE" });
}

// Real server-side pagination for NotificationBell's dropdown — each of its
// category tabs (New Leads / Reminder Alerts / Activity Alerts / HRMS /
// Finance) fetches its own page instead of slicing AppContext's full,
// bulk-loaded `notifications` array client-side. Mirrors
// notifications.routes.ts's listNotificationsQuerySchema: `system` is a
// single-select (a tab is always scoped to exactly one system), `category`
// is an include multi-select (e.g. ["NEW_LEAD"] for the New Leads tab) and
// `excludeCategory` is the complementary exclude multi-select (the Activity
// Alerts tab's "everything else" catch-all). Omitting all three reproduces
// today's unfiltered list, same as apiListNotifications() above.
export interface NotificationListFilters {
  system?: "CRM" | "HRMS" | "FINANCE" | "ADMIN";
  category?: string[];
  excludeCategory?: string[];
}

export interface NotificationsPageResult {
  rows: ApiNotificationRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export async function apiListNotificationsPage(
  page: number,
  pageSize: number,
  filters: NotificationListFilters = {}
): Promise<NotificationsPageResult> {
  const params = new URLSearchParams();
  if (filters.system) params.set("system", filters.system);
  filters.category?.forEach(c => params.append("category", c));
  filters.excludeCategory?.forEach(c => params.append("excludeCategory", c));
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const { data, meta } = await requestWithMeta<ApiNotificationRow>(`/api/v1/notifications?${params.toString()}`);
  return {
    rows: data,
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? pageSize,
    totalCount: meta?.totalCount ?? data.length,
    totalPages: meta?.totalPages ?? 1
  };
}

export function apiMarkNotificationRead(notificationId: string): Promise<{ read: boolean }> {
  return request<{ read: boolean }>(`/api/v1/notifications/${notificationId}/read`, { method: "PATCH" });
}

export function apiMarkAllNotificationsRead(system?: "CRM" | "HRMS" | "FINANCE" | "ADMIN"): Promise<{ read: boolean }> {
  const query = system ? `?system=${system}` : "";
  return request<{ read: boolean }>(`/api/v1/notifications/read-all${query}`, { method: "PATCH" });
}

// Deletes only the caller's own notifications (optionally one system) — the drawer's "Clear all".
export function apiClearNotifications(system?: "CRM" | "HRMS" | "FINANCE" | "ADMIN"): Promise<{ deleted: number }> {
  const query = system ? `?system=${system}` : "";
  return request<{ deleted: number }>(`/api/v1/notifications${query}`, { method: "DELETE" });
}

// EventSource can't set an Authorization header, so opening the stream goes
// through a one-time ticket instead of the real access token (see
// notifications.routes.ts / utils/sseTickets.ts) — mint one with a normal
// authenticated request right before opening the EventSource, since a
// ticket is single-use and expires in ~45s (so mint a fresh one on every
// reconnect too, not just the first connect).
export function apiCreateNotificationStreamTicket(): Promise<{ ticket: string }> {
  return request<{ ticket: string }>("/api/v1/notifications/stream-ticket", { method: "POST" });
}

export function buildNotificationStreamUrl(ticket: string): string {
  return `${API_BASE_URL}/api/v1/notifications/stream?ticket=${encodeURIComponent(ticket)}`;
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

// Real server-side range fetch for the CRM/Admin calendar pages' own month
// grid — a calendar UI naturally scopes by "the range currently on screen"
// rather than a generic page/pageSize, so dateFrom/dateTo (plain YYYY-MM-DD,
// same convention as leads) is the primary filter here; page/pageSize is
// just the backend's secondary safety cap (see calendar-events.routes.ts).
// AppContext's own bulk apiListCalendarEvents() above is untouched — every
// other consumer (HRMS/Finance calendars, dashboards) keeps reading the full
// array from context.
export interface CalendarEventListFilters {
  dateFrom?: string;
  dateTo?: string;
}

export interface CalendarEventsPageResult {
  rows: ApiCalendarEventRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export async function apiListCalendarEventsPage(
  page: number,
  pageSize: number,
  filters: CalendarEventListFilters = {}
): Promise<CalendarEventsPageResult> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  const { data, meta } = await requestWithMeta<ApiCalendarEventRow>(`/api/v1/calendar-events?${params.toString()}`);
  return {
    rows: data,
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? pageSize,
    totalCount: meta?.totalCount ?? data.length,
    totalPages: meta?.totalPages ?? 1
  };
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

// Real per-ad, per-day spend/leads with each row's real ad set/ad/creative
// name attached — un-aggregated (one row per ad per day), same grain as
// ApiAdSpendRow, for Campaign Deep Dive's Ad Set Name/Ad creative Name
// columns and a real per-ad-set/ad-creative CPL breakdown. Combines Meta
// and Google rows under one shape (platform-tagged) — creative_name is a
// real Meta-only field (Meta always has a distinct creative object);
// ad_type is a real Google-only field (Google's honest fallback label when
// ad.name is unset, common for Responsive Search Ads) — never both on the
// same row, never invented for the platform that doesn't have one.
export interface ApiAdLevelSpendRow {
  platform: "META" | "GOOGLE";
  ad_id: string;
  ad_name: string | null;
  creative_name?: string | null;
  ad_type?: string | null;
  ad_set_name: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: "ACTIVE" | "INACTIVE";
  spend_date: string;
  spend: string;
  leads_generated: number;
}
export function apiListAdLevelSpend(): Promise<ApiAdLevelSpendRow[]> {
  return request<ApiAdLevelSpendRow[]>("/api/v1/ad-spend/ad-level");
}

// Wakes both platforms' ad-level sync jobs early instead of waiting for
// their regular interval (Campaign Deep Dive's Sync button) — ADMIN only.
// Starts the same real Meta/Google sync already running on a timer; does
// not bypass either platform's own rate limits, so a run can still take a
// while to land. { started: false } for a platform means one was already
// in progress, not that the request failed.
export interface ApiAdSpendSyncTriggerResult {
  meta: { started: boolean };
  google: { started: boolean };
}
export function apiTriggerAdSpendSync(): Promise<ApiAdSpendSyncTriggerResult> {
  return request<ApiAdSpendSyncTriggerResult>("/api/v1/ad-spend/sync", { method: "POST" });
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

// --- Google Ads — one server-level credential (Manager/MCC account), no
// per-user OAuth to trigger from the UI; this just surfaces what the sync
// job has auto-discovered under the MCC (see jobs/googleAdsSpendSync.ts).
export interface ApiGoogleAdsAccount {
  id: string;
  name: string;
  status: "ACTIVE" | "DISCONNECTED";
  created_at: string;
}

export function apiListGoogleAdsAccounts(): Promise<ApiGoogleAdsAccount[]> {
  return request<ApiGoogleAdsAccount[]>("/api/v1/google-ads/accounts");
}

// --- Tenant Settings (HRMS geofence/half-day threshold, Finance GST rate/invoice due window) ---
export interface ApiTenantSettings {
  office_lat: string;
  office_lng: string;
  geofence_radius_meters: number;
  half_day_threshold_hours: string;
  gst_rate: string;
  invoice_due_days: number;
}

export function apiGetTenantSettings(): Promise<ApiTenantSettings> {
  return request<ApiTenantSettings>("/api/v1/tenant-settings");
}

export interface UpdateTenantSettingsInput {
  officeLat?: number;
  officeLng?: number;
  geofenceRadiusMeters?: number;
  halfDayThresholdHours?: number;
  gstRate?: number;
  invoiceDueDays?: number;
}

export function apiUpdateTenantSettings(input: UpdateTenantSettingsInput): Promise<ApiTenantSettings> {
  return request<ApiTenantSettings>("/api/v1/tenant-settings", { method: "PATCH", body: JSON.stringify(input) });
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

// Server caps pageSize at 500 (see timesheets.schema.ts) — a real safety
// limit, not something to raise just to fetch everything in one request.
const MAX_TIMESHEET_PAGE_SIZE = 500;

// Pages through every timesheet row (every employee's, for ADMIN/FINANCE —
// same role-based scoping the endpoint always enforced) and concatenates the
// results — same "fetch everything" bridge as apiListAllLeads/
// apiListAttendance, kept for AppContext's bulk load (other features, e.g.
// home/page.tsx's presentTodayCount/pendingRegularizations, read the full
// timesheets array from context). The HRMS page's own detailed tables use
// apiListTimesheetsPage below instead, which fetches exactly one page at a
// time.
export async function apiListTimesheets(): Promise<ApiTimesheetRow[]> {
  const all: ApiTimesheetRow[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, meta } = await requestWithMeta<ApiTimesheetRow>(`/api/v1/timesheets?page=${page}&pageSize=${MAX_TIMESHEET_PAGE_SIZE}`);
    all.push(...data);
    if (!meta || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
}

// Real server-side pagination for the HRMS timesheets tables — mirrors
// apiListLeadsPage. Used for both the admin "everyone's timesheets"
// regularization queue and the personal "my timesheet history" table; pass
// userId to scope to one employee (required for the personal view so a
// non-admin never pulls every employee's punch history — including GPS
// coordinates — just to show their own page; ADMIN/FINANCE may omit it to
// see everyone, which is also hard-enforced server-side).
export interface TimesheetsPageResult {
  rows: ApiTimesheetRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export async function apiListTimesheetsPage(page: number, pageSize: number, userId?: string): Promise<TimesheetsPageResult> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (userId) params.set("userId", userId);
  const { data, meta } = await requestWithMeta<ApiTimesheetRow>(`/api/v1/timesheets?${params.toString()}`);
  return {
    rows: data,
    page: meta?.page ?? page,
    pageSize: meta?.pageSize ?? pageSize,
    totalCount: meta?.totalCount ?? data.length,
    totalPages: meta?.totalPages ?? 1
  };
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
