// Shared shape for the 7 lead-pipeline stat cards shown on the CRM
// Dashboard and the admin Leads page — both now get these numbers from the
// server (GET /leads/stats, see Taskezy-Server/src/modules/leads/
// leads.service.ts's getLeadStats) rather than computing them client-side
// over the full bulk-loaded leads array, so the same field name can never
// mean a different real number depending on which page you're looking at.
export interface LeadSummaryStats {
  totalLeads: number;
  newLeads: number;
  rnr: number;
  callBacks: number;
  followUps: number;
  siteVisitScheduled: number;
  siteVisitDone: number;
}
