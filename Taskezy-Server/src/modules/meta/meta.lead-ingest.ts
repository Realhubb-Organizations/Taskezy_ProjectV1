import { pool, withTransaction } from "../../db/pool";
import { logger } from "../../utils/logger";
import { insertLeadLog } from "../leads/leads.repository";
import { isUniqueViolation } from "../users/users.repository";
import { createNotification } from "../notifications/notifications.service";
import { findPropertyIdByCampaignName } from "../properties/properties.repository";
import { pickAgentForProperty } from "../properties/properties.assignment";
import { MetaLeadData } from "./meta-client";

function firstFieldValue(fieldData: MetaLeadData["field_data"], keys: string[]): string | undefined {
  for (const datum of fieldData) {
    if (keys.includes(datum.name.toLowerCase()) && datum.values[0]) return datum.values[0];
  }
  return undefined;
}

/** leads.phone is CHECK'd to a bare 10-digit Indian mobile — strip formatting/country code before insert. */
function normalizeIndianMobile(raw: string): string | undefined {
  const last10 = raw.replace(/\D/g, "").slice(-10);
  return /^[6-9][0-9]{9}$/.test(last10) ? last10 : undefined;
}

/**
 * Turns one Meta leadgen event into a `leads` row. If the lead's campaign
 * matches a property (see findPropertyIdByCampaignName) AND that property
 * has an assignable team, it's routed through the same Round Robin /
 * Percentage rule a manually created lead for that property would use.
 * Otherwise — no property match, or a property with no configured team —
 * it lands UNASSIGNED on the connecting admin for a manager to route
 * manually, same as before.
 */
export async function ingestMetaLead(leadData: MetaLeadData, connectingAdminId: string): Promise<void> {
  const combinedFirstLast = [firstFieldValue(leadData.field_data, ["first_name"]), firstFieldValue(leadData.field_data, ["last_name"])]
    .filter(Boolean)
    .join(" ");
  const rawName = firstFieldValue(leadData.field_data, ["full_name", "name"]) ?? (combinedFirstLast || undefined);
  const rawPhone = firstFieldValue(leadData.field_data, ["phone_number", "phone"]);
  const email = firstFieldValue(leadData.field_data, ["email"]);

  if (!rawPhone) {
    logger.warn({ leadgenId: leadData.id }, "Meta lead has no phone_number field — skipped, leads.phone is required");
    return;
  }
  const phone = normalizeIndianMobile(rawPhone);
  if (!phone) {
    logger.warn({ leadgenId: leadData.id }, "Meta lead phone did not normalize to a valid 10-digit Indian mobile — skipped");
    return;
  }

  const name = rawName || "Meta Lead";
  const campaign = leadData.campaign_name || leadData.form_id || "Meta Lead Ads";
  // Matched by campaign NAME (see properties.repository.findPropertyIdByCampaignName)
  // — only meaningful when Meta actually gave us the real campaign_name, not
  // our own form_id/"Meta Lead Ads" fallback.
  const propertyId = leadData.campaign_name ? await findPropertyIdByCampaignName(leadData.campaign_name) : undefined;
  const autoAssignedAgentId = propertyId ? await pickAgentForProperty(propertyId) : undefined;
  const assignedAgentId = autoAssignedAgentId ?? connectingAdminId;
  const statusCode = autoAssignedAgentId ? "NEW" : "UNASSIGNED";

  try {
    const { rows, rowCount } = await pool.query<{ id: string }>(
      `INSERT INTO leads (name, phone, email, source, campaign, assigned_agent_id, status_code, assigned_at, meta_leadgen_id, property_id)
       VALUES ($1, $2, $3, 'Meta Ads', $4, $5, $6, now(), $7, $8)
       ON CONFLICT (meta_leadgen_id) DO NOTHING
       RETURNING id`,
      [name, phone, email ?? null, campaign, assignedAgentId, statusCode, leadData.id, propertyId ?? null]
    );

    // rowCount is 0 when ON CONFLICT DO NOTHING suppressed the insert (a
    // retried/re-delivered webhook for a leadgen_id we already have) — don't
    // re-notify for something that isn't actually a new lead.
    if (rowCount && rows[0]) {
      await createNotification({
        system: "CRM",
        category: "NEW_LEAD",
        title: "New Meta Lead",
        message: `${name} — via ${campaign}`,
        recipientUserId: assignedAgentId,
        leadId: rows[0].id,
        link: "/dashboard/crm"
      });
    }
  } catch (err) {
    // The only remaining unique constraint this insert can hit is leads.phone
    // (meta_leadgen_id conflicts are already absorbed by ON CONFLICT above) —
    // an existing customer submitted the form again. Note it, don't duplicate.
    if (isUniqueViolation(err)) {
      logger.info({ leadgenId: leadData.id }, "Meta lead phone already exists in leads — logging a note instead of creating a duplicate");
      await withTransaction(async (client) => {
        const { rows } = await client.query<{ id: string }>(`SELECT id FROM leads WHERE phone = $1`, [phone]);
        if (rows[0]) {
          await insertLeadLog(
            client,
            rows[0].id,
            connectingAdminId,
            "Meta Ads Webhook",
            `New Meta lead (leadgen ID ${leadData.id}) submitted for this phone number again — not duplicated.`
          );
        }
      });
      return;
    }
    throw err;
  }
}
