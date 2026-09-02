import { pool, withTransaction } from "../../db/pool";
import { logger } from "../../utils/logger";
import { insertLeadLog, normalizeIndianMobile } from "../leads/leads.repository";
import { isUniqueViolation, listActiveAdminIds } from "../users/users.repository";
import { createNotification } from "../notifications/notifications.service";
import { findPropertyIdBySheetSource, recordSheetSourceSeen } from "../properties/properties.repository";
import { pickAgentForProperty } from "../properties/properties.assignment";

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
  const phone = normalizeIndianMobile(row.phone);
  if (!phone) {
    return { outcome: "skipped", reason: "phone did not normalize to a valid 10-digit Indian mobile" };
  }
  const name = row.name?.trim();
  if (!name) {
    return { outcome: "skipped", reason: "name is required" };
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
  const statusCode = autoAssignedAgentId ? "NEW" : "UNASSIGNED";

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

    // The sheet often carries real prior sales activity (Status/Remarks from
    // before this lead was in Taskezy at all) plus ad-attribution details
    // this schema has no dedicated columns for — captured losslessly as the
    // lead's first log entry rather than invented into new columns or
    // silently dropped.
    const historicalBits = [
      row.status ? `Prior status: ${row.status}` : null,
      row.remarks ? `Remarks: ${row.remarks}` : null,
      row.medium ? `Medium: ${row.medium}` : null,
      row.keyword ? `Keyword: ${row.keyword}` : null,
      row.gclid ? `GCLID: ${row.gclid}` : null,
      row.landingPage ? `Landing page: ${row.landingPage}` : null,
      row.browser ? `Browser: ${row.browser}` : null,
      row.timestamp ? `Original sheet timestamp: ${row.timestamp}` : null
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

    return { outcome: "created", leadId };
  } catch (err) {
    // The only remaining unique constraint this insert can hit is leads.phone
    // (sheet_lead_key conflicts are already absorbed by ON CONFLICT above) —
    // this phone number already has a lead from some other source (or an
    // earlier sheet row). Note it, don't duplicate.
    if (isUniqueViolation(err)) {
      logger.info({ leadKey: row.leadKey }, "Sheet lead phone already exists in leads — logging a note instead of creating a duplicate");
      await withTransaction(async (client) => {
        const { rows: existing } = await client.query<{ id: string }>(`SELECT id FROM leads WHERE phone = $1`, [phone]);
        if (existing[0]) {
          await insertLeadLog(
            client,
            existing[0].id,
            assignedAgentId,
            "Google Ads Sheet Import",
            `Sheet lead (key ${row.leadKey}) submitted for this phone number again — not duplicated.`
          );
        }
      });
      return { outcome: "duplicate" };
    }
    throw err;
  }
}
