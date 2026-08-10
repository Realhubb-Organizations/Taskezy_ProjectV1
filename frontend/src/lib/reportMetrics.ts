import { Lead, AdSpendRecord, LeadStatus, FollowupCall } from "@/context/AppContext";

const BUYER_STATUSES = new Set<LeadStatus>([
  "Interested", "Follow up", "Follow-ups", "Call Back", "Meeting Scheduled", "Meeting Done",
  "Site Visit Scheduled", "Site Visit Done", "Site Visit", "In Negotiation",
  "Booking Done", "Booking Approved", "Booked", "EOI Customers", "Visit Schedule", "Completed", "Finance Review"
]);

const NON_BUYER_STATUSES = new Set<LeadStatus>([
  "Dead", "Invalid", "Not Interested", "RNR", "Switch off", "Low Budget", "Finance Rejected"
]);

const BOOKING_STATUSES = new Set<LeadStatus>(["Booking Done", "Booking Approved", "Booked"]);

const SLA_MINUTES = 20;

export function toDateKey(iso: string): string {
  return iso.split("T")[0];
}

export function inRange(dateKey: string, from: string, to: string): boolean {
  return dateKey >= from && dateKey <= to;
}

export function filterLeadsByRange(leads: Lead[], from: string, to: string): Lead[] {
  return leads.filter(l => l.assignedAt && inRange(toDateKey(l.assignedAt), from, to));
}

export function filterAdSpendByRange(records: AdSpendRecord[], from: string, to: string): AdSpendRecord[] {
  return records.filter(r => inRange(r.date, from, to));
}

export function filterFollowupsByRange(followups: FollowupCall[], from: string, to: string): FollowupCall[] {
  return followups.filter(f => inRange(f.date, from, to));
}

export function computeCPL(totalSpend: number, totalLeads: number): number {
  return totalLeads === 0 ? 0 : totalSpend / totalLeads;
}

export function computeLeadQuality(leads: Lead[]): { qualityPercent: number; buyerCount: number; nonBuyerCount: number } {
  const buyerCount = leads.filter(l => BUYER_STATUSES.has(l.status)).length;
  const nonBuyerCount = leads.filter(l => NON_BUYER_STATUSES.has(l.status)).length;
  const classified = buyerCount + nonBuyerCount;
  const qualityPercent = classified === 0 ? 0 : (buyerCount / classified) * 100;
  return { qualityPercent, buyerCount, nonBuyerCount };
}

export function computeBookingValue(leads: Lead[]): number {
  return leads.filter(l => BOOKING_STATUSES.has(l.status)).reduce((sum, l) => sum + (l.dealValue || 0), 0);
}

export function computeBookingCount(leads: Lead[]): number {
  return leads.filter(l => BOOKING_STATUSES.has(l.status)).length;
}

// Expressed as a multiple (e.g. 4.2 = ₹4.20 in booking value per ₹1 spent)
export function computeROIMultiple(bookingValue: number, spend: number): number {
  return spend === 0 ? 0 : bookingValue / spend;
}

// Proportional spend attribution: an entity's share of spend equals its share of lead volume in range
export function computeAllocatedSpend(entityLeadsCount: number, totalLeadsCount: number, totalSpend: number): number {
  return totalLeadsCount === 0 ? 0 : (entityLeadsCount / totalLeadsCount) * totalSpend;
}

export interface MissedInfo {
  missed: boolean;
  responseMinutes?: number;
}

// A lead is "missed" when no status update occurred within the 20-minute SLA window after assignment
export function getMissedInfo(lead: Lead): MissedInfo {
  if (!lead.assignedAt) return { missed: false };
  const assignedTime = new Date(lead.assignedAt).getTime();
  if (lead.firstResponseAt) {
    const responseMinutes = (new Date(lead.firstResponseAt).getTime() - assignedTime) / 60000;
    return { missed: responseMinutes > SLA_MINUTES, responseMinutes: Math.round(responseMinutes) };
  }
  const minutesSinceAssign = (Date.now() - assignedTime) / 60000;
  return { missed: minutesSinceAssign > SLA_MINUTES };
}

export function isMissedLead(lead: Lead): boolean {
  return getMissedInfo(lead).missed;
}

export function formatCurrency(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function formatMinutes(minutes?: number): string {
  if (minutes === undefined) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hrs}h ${rem}m`;
}
