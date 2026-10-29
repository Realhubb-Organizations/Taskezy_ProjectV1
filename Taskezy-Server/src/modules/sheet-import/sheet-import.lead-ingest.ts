import { pool, withTransaction } from "../../db/pool";
import { logger } from "../../utils/logger";
import { insertLeadLog, normalizeLeadPhone } from "../leads/leads.repository";
import { findLeadForRevival, markLeadRevived } from "../leads/leadRevival";
import { isUniqueViolation, listActiveAdminIds } from "../users/users.repository";
import { createNotification } from "../notifications/notifications.service";
import { findPropertyIdBySheetSource, recordSheetSourceSeen } from "../properties/properties.repository";
import { pickAgentForProperty } from "../properties/properties.assignment";
import { broadcastLeadChanged } from "../leads/leads.realtime";

export interface SheetLeadRow {
  leadKey: string;
  timestamp?: string | null;
  name: string;
  email?: string | null;
  phone: string;
  status?: string | null;
  remarks?: string | null;
  formSource?: string | null;
  campaign?: string | null;
  source?: string | null;
  medium?: string | null;
  keyword?: string | null;
  gclid?: string | null;
  landingPage?: string | null;
  browser?: string | null;
  sourceSheet?: string | null;
}

export type SheetLeadIngestResult =
  | { outcome: "created"; leadId: string }
  | { outcome: "duplicate" }
  | { outcome: "skipped"; reason: string };

/**
 * Turns one row from the Google Ads lead-form Master sheet into a `leads`
 * row. `sourceSheet` (the sheet's per-project tab name, e.g. "Neopolis") is
 * matched against an explicit property_sheet_sources link (set by an admin
 * in the Property editor — see properties.routes.ts's /:id/sheet-sources),
 * not a fuzzy match against the property's display name; if that property
 * has a configured team, the lead is routed through the same Round Robin /
 * Percentage rule a manually created lead for that property would use —
 * mirrors ingestMetaLead (see modules/meta/meta.lead-ingest.ts) almost
 * exactly, just keyed by sheet_lead_key instead of meta_leadgen_id.
 * Otherwise it lands UNASSIGNED on the first active admin for a manager to
 * route manually, same fallback the Meta webhook uses.
 */
export async function ingestSheetLead(row: SheetLeadRow): Promise<SheetLeadIngestResult> {
  const phone = normalizeLeadPhone(row.phone);
  if (!phone) {
    return { outcome: "skipped", reason: "phone is not a valid 10-digit Indian mobile or +country-code number" };
  }
  const name = row.name?.trim();
  if (!name) {
    return { outcome: "skipped", reason: "name is required" };
  }

  // Same prospect submitting another lead form — matched by phone, or by
  // email when given (name is never matched on, too many false-positive
  // risks). Marks the EXISTING lead revived and notifies instead of
  // creating a duplicate; skips the property/agent-assignment work below
  // entirely since nothing new is being inserted.
  const revival = await findLeadForRevival(phone, row.email ?? null);
  if (revival) {
    await markLeadRevived(revival, "Google Ads Sheet Import");
    logger.info({ leadKey: row.leadKey, existingLeadId: revival.id, matchedBy: revival.matched_by }, "Sheet lead matched an existing lead — marked revived instead of creating a duplicate");
    return { outcome: "duplicate" };
  }

  if (row.sourceSheet) {
    // Fire-and-record regardless of match outcome — this is what lets an
    // admin see "Neopolis" as a pickable suggestion in the Property editor
    // the moment its first lead arrives, with no code change needed.
    await recordSheetSourceSeen(row.sourceSheet);
  }
  const propertyId = row.sourceSheet ? await findPropertyIdBySheetSource(row.sourceSheet) : undefined;
  const autoAssignedAgentId = propertyId ? await pickAgentForProperty(propertyId) : undefined;

  const assignedAgentId = autoAssignedAgentId ?? (await listActiveAdminIds())[0];
  if (!assignedAgentId) {
    return { outcome: "skipped", reason: "no assignable agent for the property and no active admin to fall back to" };
  }
  const statusCode = autoAssignedAgentId ? "NEW_LEAD" : "UNASSIGNED";

  const source = row.source || "Google Ads Sheet";
  const campaign = row.campaign || row.formSource || row.sourceSheet || undefined;

  // created_at defaults to now() at the DB level, which is wrong here — that
  // would date every lead by when the sync happened to run, not when the
  // prospect actually submitted the form. Use the sheet's own Timestamp
  // column when it parses to a real date; fall back to "now" (still better
  // than crashing the whole row) if it's missing/unparseable.
  const parsedTimestamp = row.timestamp ? new Date(row.timestamp) : undefined;
  const createdAt = parsedTimestamp && !isNaN(parsedTimestamp.getTime()) ? parsedTimestamp : new Date();

  try {
    const { rows, rowCount } = await pool.query<{ id: string }>(
      `INSERT INTO leads (name, phone, email, source, campaign, assigned_agent_id, status_code, assigned_at, sheet_lead_key, property_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, $10)
       ON CONFLICT (sheet_lead_key) DO NOTHING
       RETURNING id`,
      [name, phone, row.email || null, source, campaign ?? null, assignedAgentId, statusCode, row.leadKey, propertyId ?? null, createdAt]
    );

    // rowCount is 0 when ON CONFLICT DO NOTHING suppressed the insert (a
    // re-synced row we already imported) — nothing new happened.
    if (!rowCount || !rows[0]) {
      return { outcome: "duplicate" };
    }
    const leadId = rows[0].id;

    // Only genuine prior sales activity (Status/Remarks, from before this
    // lead was in Taskezy at all) is worth an agent reading in Activity
    // History. The sheet's own ad-attribution fields (medium/keyword/
    // gclid/landing page URL/browser user-agent/raw sheet timestamp) are
    // real but purely technical — they used to all get dumped into this
    // same note, making it unreadably long; left out of the visible note
    // entirely now rather than kept in a form nobody actually reads.
    const historicalBits = [
      row.status ? `Prior status: ${row.status}` : null,
      row.remarks ? `Remarks: ${row.remarks}` : null
    ].filter((v): v is string => Boolean(v));

    if (historicalBits.length > 0) {
      await withTransaction(async (client) => {
        await insertLeadLog(
          client,
          leadId,
          assignedAgentId,
          "Google Ads Sheet Import",
          `Imported from Google Ads lead-form sheet (${row.sourceSheet || "unknown project"}). ${historicalBits.join(" · ")}`
        );
      });
    }

    await createNotification({
      system: "CRM",
      category: "NEW_LEAD",
      title: "New Sheet Lead",
      message: `${name} — via ${campaign || source}`,
      recipientUserId: assignedAgentId,
      leadId,
      link: "/dashboard/crm"
    });
    broadcastLeadChanged(leadId);

    return { outcome: "created", leadId };
  } catch (err) {
    // The only remaining unique constraint this insert can hit is leads.phone
    // (sheet_lead_key conflicts are already absorbed by ON CONFLICT above) —
    // this phone number already has a lead from some other source (or an
    // earlier sheet row). Note it, don't duplicate.
    if (isUniqueViolation(err)) {
      // Same revival handling as the proactive check above (clean Activity
      // History note + agent/manager/admin notification) — this only fires
      // on a genuine race (another request inserted the same phone between
      // our check and this insert), so it stays rare, but should still look
      // and behave identically to the normal case, not a separate bare note.
      const revival = await findLeadForRevival(phone, row.email ?? null);
      if (revival) {
        await markLeadRevived(revival, "Google Ads Sheet Import");
      }
      logger.info({ leadKey: row.leadKey, existingLeadId: revival?.id }, "Sheet lead phone already exists in leads — marked revived instead of creating a duplicate");
      return { outcome: "duplicate" };
    }
    throw err;
  }
}
