/**
 * One-off import of every lead from the team's old CRM, Leadi5
 * (realhubb.retconsoft.com), into this CRM. Input is the export folder
 * produced from Leadi5's own API — kept off GitHub (customer data):
 *   leads-full.json         every Leadi5 lead, all fields
 *   activities.json         { <leadi5 lead _id>: [activity, ...] }
 *   mapping-decisions.json  property / agent / status mapping, confirmed by Priya on 29 Oct 2026
 *
 * Dry run (default, writes nothing to the DB, writes leadi5-import-plan.xlsx into the folder):
 *   npx tsx scripts/importLeadi5.ts <export-folder>
 * Real run:
 *   npx tsx scripts/importLeadi5.ts <export-folder> --commit
 *
 * Rules (all confirmed by Priya — see mapping-decisions.json "rules"):
 * - Leads are matched by phone (10-digit Indian mobile, or +country code for a foreign
 *   number — needs migration 048); an existing lead is updated, never duplicated.
 *   Leadi5's own repeats of one phone collapse into the most recently updated copy
 *   (history of every copy is kept).
 * - Taskezy has newer activity than Leadi5 and a different, real status: Taskezy's
 *   status/agent/property stay exactly as they are; only empty fields are filled.
 * - Currently with a real agent other than Leadi5's: that agent is kept; Leadi5's
 *   status is applied.
 * - Any other existing lead: Leadi5's status is applied, and a lead still parked on
 *   Super Admin moves to its Leadi5 agent.
 * - Property, email, campaign and notes are only ever filled when empty — an existing
 *   different value is kept and listed in the plan's "Property differs" sheet.
 * - "Transfer" resolves to the last real status in the lead's own history; if there
 *   is none it becomes Followup with a cross-check note. "After RERA" becomes Followup
 *   with the latest Leadi5 note as the lead's note.
 * - History: every Leadi5 activity not already on the timeline is added with its
 *   original time and author. "Already there" = same text on the same lead within
 *   6 hours (an earlier import stored times in IST-as-UTC), so a re-run adds nothing.
 * - New leads get first_response_at from Leadi5's first contact, or are marked as
 *   already notified, so the missed-lead scheduler doesn't fire alerts for months-old
 *   leads the moment they land.
 * - No notifications are sent and assigned_at / first_response_at of existing leads
 *   are never touched.
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { pool, withTransaction } from "../src/db/pool";
import { normalizeIndianMobile } from "../src/modules/leads/leads.repository";
import { normalizeForeignPhone } from "../src/utils/validation";

const dirArg = process.argv.slice(2).find(a => !a.startsWith("--"));
if (!dirArg) {
  console.error("Usage: npx tsx scripts/importLeadi5.ts <export-folder> [--commit]");
  process.exit(1);
}
const DIR = path.resolve(dirArg);
const COMMIT = process.argv.includes("--commit");
const SUPER_ADMIN_EMAIL = "admin@realhubb.in";
const CHUNK_SIZE = 200;
const SAME_ENTRY_WINDOW_MS = 6 * 60 * 60 * 1000;
const TRANSFER_UNCLEAR_NOTE =
  'Status was unclear in Leadi5 ("Transfer") — set to Followup during migration to be on the safer side. Please cross-check.';

interface Leadi5Activity {
  _id: string;
  type: string;
  description?: string;
  details?: Record<string, any>;
  createdAt: string;
  createdBy?: { name?: string };
}
interface Leadi5Lead {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  source?: string;
  notes?: string;
  assignedTo?: { name?: string } | null;
  assignedAt?: string | null;
  firstContactAt?: string | null;
  propertyId?: { title?: string } | string | null;
  property?: { title?: string; name?: string } | string | null;
  facebookMetadata?: { campaignName?: string; formId?: string; adId?: string } | null;
  lastActivityAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
interface Decisions {
  properties: Record<string, string>;
  agents: Record<string, string>;
  statuses: Record<string, string>;
  skip_phones?: string[]; // confirmed not to import at all (e.g. Leadi5 test leads)
  skip_history_types?: string[]; // Leadi5 activity types left off the timeline
}

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
const clean = (v: unknown): string | undefined => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s && s.toUpperCase() !== "N/A" ? s : undefined;
};

// normalizeIndianMobile keeps the last 10 digits of anything, so a foreign
// number (+44 7911 123456) also comes out as a real-looking Indian one. Only a
// bare / 0 / 91 / 0091 prefix counts as certainly Indian.
const isCertainMobile = (raw: unknown) => /^(0{0,2}91|0)?[6-9]\d{9}$/.test(String(raw ?? "").replace(/\D/g, ""));
const sameName = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

function leadi5Property(l: Leadi5Lead): string | undefined {
  for (const p of [l.propertyId, l.property]) {
    if (p && typeof p === "object") return clean((p as any).title || (p as any).name);
    if (clean(p)) return clean(p);
  }
  return undefined;
}

// One readable timeline line per Leadi5 activity. Status changes keep the
// "From → To" shape the earlier Migration4050 import already wrote, so those
// entries are recognised as already present.
function activityMessage(a: Leadi5Activity): string | undefined {
  const d = a.details || {};
  const desc = clean(a.description)?.replace(/ by undefined$/, "");
  switch (a.type) {
    case "note":
      return desc ? `Note: ${desc}` : undefined;
    case "status_change":
      return d.from || d.to ? `${d.from || "—"} → ${d.to || "—"}` : desc;
    case "call": {
      const parts = [d.direction, d.callDuration].filter(Boolean).join(", ");
      return `Call${parts ? ` (${parts})` : ""}: ${d.outcome || d.status || "logged"}`;
    }
    case "lead_revived":
      return `Lead revived${d.previousStatus ? ` (was ${d.previousStatus})` : ""}`;
    case "integration":
      return `Imported from ${d.provider || "integration"}`;
    case "site_visit":
      return [desc, clean(d.note)].filter(Boolean).join(" — ") || undefined;
    default:
      return desc;
  }
}

// Text used to decide "is this entry already on the timeline".
const sameText = (m: string) => m.toLowerCase().replace(/^note:\s*/, "").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();

type Category = "NEW" | "TASKEZY_NEWER" | "OTHER_AGENT" | "EXISTING";

interface Existing {
  id: string;
  name: string;
  phone: string;
  status_code: string;
  assigned_agent_id: string;
  property_id: string | null;
  email: string | null;
  source: string | null;
  campaign: string | null;
  notes: string | null;
  meta_form_id: string | null;
  meta_ad_id: string | null;
  last_log_at: Date | null;
}

interface Plan {
  phone: string;
  leadi5: Leadi5Lead;
  category: Category;
  existing?: Existing;
  statusCode: string;
  statusWhy: string;
  agentId: string;
  propertyId: string | null;
  propertyDiffers?: string;
  email: string | null;
  campaign: string | null;
  notes: string | null;
  source: string | null;
  metaFormId: string | null;
  metaAdId: string | null;
  extraLog?: string;
  logs: { userId: string; userName: string; message: string; at: Date }[];
  flags: string[];
}

async function run(): Promise<void> {
  console.log(`== Leadi5 import — ${COMMIT ? "COMMIT" : "DRY RUN"} — ${DIR} ==`);

  const leads = readJson<Leadi5Lead[]>("leads-full.json");
  const activities = readJson<Record<string, Leadi5Activity[] | unknown>>("activities.json");
  const dec = readJson<Decisions>("mapping-decisions.json");
  const activitiesOf = (id: string): Leadi5Activity[] => (Array.isArray(activities[id]) ? (activities[id] as Leadi5Activity[]) : []);

  // ---- reference data, and a hard stop if any confirmed mapping points at nothing
  const { rows: users } = await pool.query<{ id: string; name: string; email: string }>(
    `SELECT id, first_name || COALESCE(' ' || last_name, '') AS name, email FROM users`
  );
  const userByEmail = new Map(users.map(u => [u.email.toLowerCase(), u]));
  const superAdmin = userByEmail.get(SUPER_ADMIN_EMAIL);
  const { rows: properties } = await pool.query<{ id: string; name: string }>(`SELECT id, name FROM properties`);
  const propertyByName = new Map(properties.map(p => [p.name.trim().toLowerCase(), p]));
  const { rows: statuses } = await pool.query<{ code: string; label: string }>(`SELECT code, label FROM lead_statuses`);
  const statusLabel = new Map(statuses.map(s => [s.code, s.label]));

  const missing: string[] = [];
  if (!superAdmin) missing.push(`user ${SUPER_ADMIN_EMAIL}`);
  for (const email of new Set(Object.values(dec.agents))) if (!userByEmail.has(email.toLowerCase())) missing.push(`user ${email}`);
  for (const name of new Set(Object.values(dec.properties))) if (name && !propertyByName.has(name.trim().toLowerCase())) missing.push(`property "${name}"`);
  for (const code of new Set(Object.values(dec.statuses))) if (/^[A-Z_]+$/.test(code) && !code.startsWith("USE_") && !statusLabel.has(code)) missing.push(`status ${code}`);
  if (missing.length) {
    console.error(`\nThese confirmed mappings don't exist in this database — nothing done:\n  ${missing.join("\n  ")}`);
    await pool.end();
    process.exit(1);
  }
  const userById = new Map(users.map(u => [u.id, u]));
  const authorId = (name?: string) => {
    const email = name ? dec.agents[name] : undefined;
    return (email && userByEmail.get(email.toLowerCase())?.id) || superAdmin!.id;
  };

  // ---- what Taskezy has now, looked up by every form a Leadi5 number could be stored in
  const loosePhone = (l: Leadi5Lead) => normalizeIndianMobile(String(l.phone ?? ""));
  const foreignPhone = (l: Leadi5Lead) => normalizeForeignPhone(String(l.phone ?? ""));
  const candidates = [...new Set(leads.flatMap(l => [loosePhone(l), foreignPhone(l)]).filter((p): p is string => !!p))];
  const { rows: existingRows } = await pool.query<Existing>(
    `SELECT l.id, l.name, l.phone, l.status_code, l.assigned_agent_id, l.property_id, l.email, l.source,
            l.campaign, l.notes, l.meta_form_id, l.meta_ad_id,
            (SELECT max(created_at) FROM lead_logs WHERE lead_id = l.id) AS last_log_at
     FROM leads l WHERE l.phone = ANY($1::text[])`,
    [candidates]
  );
  const existingByPhone = new Map(existingRows.map(r => [r.phone, r]));

  // ---- Leadi5 leads, one per phone (latest updatedAt wins, every copy's history kept).
  // A certain Indian mobile is its 10 digits. An odd-looking number whose last
  // 10 digits are an existing lead with the same name is that lead (the earlier
  // Migration4050 import stored it that way). Otherwise a +country-code number
  // is a foreign one; anything else is skipped.
  const byPhone = new Map<string, { lead: Leadi5Lead; ids: string[] }>();
  const badPhones: Leadi5Lead[] = [];
  let skippedOnPurpose = 0;
  for (const l of leads) {
    const loose = loosePhone(l);
    const ex = loose ? existingByPhone.get(loose) : undefined;
    const phone = isCertainMobile(l.phone) || (ex && sameName(l.name, ex.name)) ? loose : foreignPhone(l);
    if (!phone) { badPhones.push(l); continue; }
    if (dec.skip_phones?.includes(phone)) { skippedOnPurpose++; continue; }
    const prev = byPhone.get(phone);
    if (!prev) { byPhone.set(phone, { lead: l, ids: [l._id] }); continue; }
    prev.ids.push(l._id);
    if (new Date(l.updatedAt) > new Date(prev.lead.updatedAt)) prev.lead = l;
  }
  const timeline = new Map<string, Map<string, number[]>>();
  if (existingRows.length) {
    const { rows: logRows } = await pool.query<{ lead_id: string; message: string; created_at: Date }>(
      `SELECT lead_id, message, created_at FROM lead_logs WHERE lead_id = ANY($1::uuid[])`,
      [existingRows.map(r => r.id)]
    );
    for (const r of logRows) {
      const perLead = timeline.get(r.lead_id) ?? timeline.set(r.lead_id, new Map()).get(r.lead_id)!;
      const k = sameText(r.message);
      (perLead.get(k) ?? perLead.set(k, []).get(k)!).push(new Date(r.created_at).getTime());
    }
  }

  // ---- plan every lead
  const plans: Plan[] = [];
  const unmapped = { status: new Map<string, number>(), agent: new Map<string, number>(), property: new Map<string, number>() };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);

  for (const [phone, { lead: l, ids }] of byPhone) {
    const acts = [...new Map(ids.flatMap(activitiesOf).map(a => [a._id, a])).values()]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const latestNote = [...acts].reverse().find(a => a.type === "note" && clean(a.description))?.description?.trim();
    const flags: string[] = [];

    // status
    let statusCode = dec.statuses[l.status || ""];
    let statusWhy = "";
    let extraLog: string | undefined;
    let leadNote = clean(l.notes);
    if (statusCode === "USE_LAST_REAL_STATUS_FROM_HISTORY") {
      const last = [...acts].reverse().find(a => a.type === "status_change" && a.details?.to && a.details.to !== "Transfer")?.details?.to;
      const code = last ? dec.statuses[last] : undefined;
      if (code && /^[A-Z_]+$/.test(code)) {
        statusCode = code;
        statusWhy = `Transfer → last real status "${last}"`;
      } else {
        statusCode = "FOLLOWUP";
        statusWhy = "Transfer, no clear earlier status → Followup";
        extraLog = TRANSFER_UNCLEAR_NOTE;
        leadNote = leadNote || TRANSFER_UNCLEAR_NOTE;
      }
    } else if (statusCode?.startsWith("FOLLOWUP")) {
      if (l.status === "After RERA") {
        statusWhy = "After RERA → Followup + latest note";
        leadNote = latestNote || leadNote;
      }
      statusCode = "FOLLOWUP";
    }
    if (!statusCode || !statusLabel.has(statusCode)) {
      bump(unmapped.status, l.status || "(empty)");
      continue;
    }

    // agent
    const agentName = l.assignedTo?.name || "(no agent)";
    const agentEmail = dec.agents[agentName];
    if (!agentEmail) { bump(unmapped.agent, agentName); continue; }
    const leadi5AgentId = userByEmail.get(agentEmail.toLowerCase())!.id;

    // property ("" = confirmed skip)
    const propName = leadi5Property(l) || "(empty in Leadi5)";
    const target = dec.properties[propName];
    if (target === undefined) { bump(unmapped.property, propName); continue; }
    const leadi5PropertyId = target ? propertyByName.get(target.trim().toLowerCase())!.id : null;

    const fb = l.facebookMetadata || {};
    const ex = existingByPhone.get(phone);
    const plan: Plan = {
      phone, leadi5: l, existing: ex, flags, extraLog,
      category: "NEW",
      statusCode, statusWhy,
      agentId: leadi5AgentId,
      propertyId: leadi5PropertyId,
      email: clean(l.email) || null,
      campaign: clean(fb.campaignName) || null,
      notes: leadNote || null,
      source: clean(l.source) || null,
      metaFormId: clean(fb.formId) || null,
      metaAdId: clean(fb.adId) || null,
      logs: []
    };

    if (ex) {
      const leadi5Last = new Date(l.lastActivityAt || l.updatedAt).getTime();
      const taskezyNewer = !!ex.last_log_at && new Date(ex.last_log_at).getTime() > leadi5Last
        && ex.status_code !== statusCode && !["UNASSIGNED", "NEW_LEAD"].includes(ex.status_code);
      const otherAgent = ex.assigned_agent_id !== superAdmin!.id && ex.assigned_agent_id !== leadi5AgentId;
      plan.category = taskezyNewer ? "TASKEZY_NEWER" : otherAgent ? "OTHER_AGENT" : "EXISTING";
      if (taskezyNewer) {
        plan.statusCode = ex.status_code;
        plan.statusWhy = "Taskezy has newer activity — kept";
        plan.extraLog = undefined;
      }
      if (taskezyNewer || otherAgent || leadi5AgentId === superAdmin!.id) plan.agentId = ex.assigned_agent_id;
      if (ex.property_id && leadi5PropertyId && ex.property_id !== leadi5PropertyId) {
        plan.propertyDiffers = target;
        flags.push(`Property differs — kept Taskezy's, Leadi5 says "${target}"`);
      }
      plan.propertyId = ex.property_id || leadi5PropertyId;
      plan.email = ex.email || plan.email;
      plan.campaign = ex.campaign || plan.campaign;
      plan.notes = ex.notes || plan.notes;
      plan.source = ex.source || plan.source;
      plan.metaFormId = ex.meta_form_id || plan.metaFormId;
      plan.metaAdId = ex.meta_ad_id || plan.metaAdId;
    }

    // history not already on the timeline
    const known = ex ? timeline.get(ex.id) : undefined;
    for (const a of acts) {
      if (dec.skip_history_types?.includes(a.type)) continue;
      const message = activityMessage(a);
      if (!message) continue;
      const at = new Date(a.createdAt);
      const seen = known?.get(sameText(message));
      if (seen?.some(t => Math.abs(t - at.getTime()) <= SAME_ENTRY_WINDOW_MS)) continue;
      plan.logs.push({ userId: authorId(a.createdBy?.name), userName: a.createdBy?.name || "Leadi5", message, at });
    }
    if (plan.extraLog && !known?.has(sameText(plan.extraLog))) {
      plan.logs.push({ userId: superAdmin!.id, userName: "Leadi5 migration", message: plan.extraLog, at: new Date() });
    }
    plans.push(plan);
  }

  // ---- summary
  const changed = (p: Plan) => !!p.existing && (
    p.statusCode !== p.existing.status_code || p.agentId !== p.existing.assigned_agent_id ||
    p.propertyId !== p.existing.property_id || p.email !== p.existing.email || p.campaign !== p.existing.campaign ||
    p.notes !== p.existing.notes || p.source !== p.existing.source ||
    p.metaFormId !== p.existing.meta_form_id || p.metaAdId !== p.existing.meta_ad_id);
  const count = (f: (p: Plan) => boolean) => plans.filter(f).length;
  const name = (id: string) => userById.get(id)?.name || id;
  const logCountByType = new Map<string, number>();
  for (const p of plans) for (const lg of p.logs) bump(logCountByType, lg.message.split(/[:(→]/)[0].trim().slice(0, 20));

  console.log(`\nLeadi5: ${leads.length} leads, ${byPhone.size} unique phones (${leads.length - byPhone.size - badPhones.length - skippedOnPurpose} repeats collapsed), ${badPhones.length} without a valid mobile (skipped)` +
    (skippedOnPurpose ? `, ${skippedOnPurpose} on the skip list.` : "."));
  console.log(`New leads to create:            ${count(p => !p.existing)}`);
  console.log(`Existing leads matched by phone: ${count(p => !!p.existing)} (${count(changed)} with a field change)`);
  console.log(`  … status changes:              ${count(p => !!p.existing && p.statusCode !== p.existing.status_code)}`);
  console.log(`  … agent moves (from Super Admin): ${count(p => !!p.existing && p.agentId !== p.existing.assigned_agent_id)}`);
  console.log(`  … property filled:             ${count(p => !!p.existing && !p.existing.property_id && !!p.propertyId)}`);
  console.log(`  … Taskezy newer, kept as is:   ${count(p => p.category === "TASKEZY_NEWER")}`);
  console.log(`  … other real agent, kept:      ${count(p => p.category === "OTHER_AGENT")}`);
  console.log(`  … property differs, kept:      ${count(p => !!p.propertyDiffers)}`);
  console.log(`  … Transfer → Followup + note:  ${count(p => !!p.extraLog)}`);
  console.log(`History entries to add:          ${plans.reduce((s, p) => s + p.logs.length, 0)}`);
  for (const [k, v] of [...logCountByType].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${String(v).padStart(6)}  ${k}`);
  const unmappedTotal = [...unmapped.status.values(), ...unmapped.agent.values(), ...unmapped.property.values()].reduce((a, b) => a + b, 0);
  if (unmappedTotal) {
    console.log(`\n⚠ ${unmappedTotal} leads skipped — value not in mapping-decisions.json:`);
    for (const [kind, m] of Object.entries(unmapped)) for (const [k, v] of m) console.log(`  ${kind} "${k}": ${v}`);
  }
  const perAgent = new Map<string, number>();
  for (const p of plans) bump(perAgent, name(p.agentId));
  console.log(`\nLeadi5 leads per agent after import:`);
  for (const [k, v] of [...perAgent].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

  await writePlan(plans, badPhones, name, (c: string) => statusLabel.get(c) || c,
    new Map(properties.map(p => [p.id, p.name])));

  if (!COMMIT) {
    console.log(`\nDry run only — nothing written. Plan saved to ${path.join(DIR, "leadi5-import-plan.xlsx")}. Re-run with --commit to import.`);
    await pool.end();
    return;
  }

  // ---- commit
  const foreignNew = plans.filter(p => !p.existing && p.phone.startsWith("+")).length;
  if (foreignNew) {
    const { rows: [check] } = await pool.query<{ def: string | null }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'leads'::regclass AND conname = 'leads_phone_check'`
    );
    if (!check?.def?.includes("\\+")) {
      console.error(`\n${foreignNew} new leads have a foreign number — run migrations-archive/048_leads_foreign_phone.sql first. Nothing written.`);
      await pool.end();
      process.exit(1);
    }
  }
  console.log(`\n== Committing ==`);
  let inserted = 0, updated = 0, logsAdded = 0, raced = 0;
  for (let i = 0; i < plans.length; i += CHUNK_SIZE) {
    const chunk = plans.slice(i, i + CHUNK_SIZE);
    await withTransaction(async (client) => {
      const idByPhone = new Map<string, string>();
      const toInsert = chunk.filter(p => !p.existing);
      if (toInsert.length) {
        const { rows } = await client.query<{ id: string; phone: string }>(
          `INSERT INTO leads (name, phone, email, source, campaign, meta_form_id, meta_ad_id, property_id,
                              assigned_agent_id, status_code, notes, assigned_at, first_response_at,
                              missed_notified_at, created_at)
           SELECT n, p, e, src, camp, form, ad, prop, agent, status, note, assigned, first_resp,
                  CASE WHEN first_resp IS NULL THEN created END, created
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::uuid[],
                       $9::uuid[], $10::text[], $11::text[], $12::timestamptz[], $13::timestamptz[], $14::timestamptz[])
             AS t(n, p, e, src, camp, form, ad, prop, agent, status, note, assigned, first_resp, created)
           ON CONFLICT (phone) DO NOTHING
           RETURNING id, phone`,
          [
            toInsert.map(p => clean(p.leadi5.name) || "Unknown"),
            toInsert.map(p => p.phone),
            toInsert.map(p => p.email),
            toInsert.map(p => p.source),
            toInsert.map(p => p.campaign),
            toInsert.map(p => p.metaFormId),
            toInsert.map(p => p.metaAdId),
            toInsert.map(p => p.propertyId),
            toInsert.map(p => p.agentId),
            toInsert.map(p => p.statusCode),
            toInsert.map(p => p.notes),
            toInsert.map(p => p.leadi5.assignedAt || p.leadi5.createdAt),
            toInsert.map(p => p.leadi5.firstContactAt || null),
            toInsert.map(p => p.leadi5.createdAt)
          ]
        );
        inserted += rows.length;
        raced += toInsert.length - rows.length; // created by someone since the plan was made — picked up by a re-run
        for (const r of rows) idByPhone.set(r.phone, r.id);
      }

      const toUpdate = chunk.filter(p => p.existing && changed(p));
      if (toUpdate.length) {
        await client.query(
          `UPDATE leads l SET status_code = v.status, assigned_agent_id = v.agent, property_id = v.prop,
                  email = v.e, campaign = v.camp, notes = v.note, source = v.src,
                  meta_form_id = v.form, meta_ad_id = v.ad
           FROM unnest($1::uuid[], $2::text[], $3::uuid[], $4::uuid[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[])
             AS v(id, status, agent, prop, e, camp, note, src, form, ad)
           WHERE l.id = v.id`,
          [
            toUpdate.map(p => p.existing!.id),
            toUpdate.map(p => p.statusCode),
            toUpdate.map(p => p.agentId),
            toUpdate.map(p => p.propertyId),
            toUpdate.map(p => p.email),
            toUpdate.map(p => p.campaign),
            toUpdate.map(p => p.notes),
            toUpdate.map(p => p.source),
            toUpdate.map(p => p.metaFormId),
            toUpdate.map(p => p.metaAdId)
          ]
        );
        updated += toUpdate.length;
      }
      for (const p of chunk) if (p.existing) idByPhone.set(p.phone, p.existing.id);

      const logRows = chunk.flatMap(p => {
        const leadId = idByPhone.get(p.phone);
        return leadId ? p.logs.map(lg => ({ leadId, ...lg })) : [];
      });
      if (logRows.length) {
        await client.query(
          `INSERT INTO lead_logs (lead_id, user_id, user_name_snapshot, message, created_at)
           SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::timestamptz[])`,
          [
            logRows.map(r => r.leadId),
            logRows.map(r => r.userId),
            logRows.map(r => r.userName),
            logRows.map(r => r.message),
            logRows.map(r => r.at.toISOString())
          ]
        );
        logsAdded += logRows.length;
      }
    });
    console.log(`  ${Math.min(i + CHUNK_SIZE, plans.length)}/${plans.length}: ${inserted} created, ${updated} updated, ${logsAdded} history entries`);
  }
  console.log(`\nDone. Created ${inserted}, updated ${updated}, added ${logsAdded} history entries.` +
    (raced ? ` ${raced} new leads appeared meanwhile and were skipped — run again to update them.` : ""));
  await pool.end();
}

async function writePlan(
  plans: Plan[], badPhones: Leadi5Lead[], agentName: (id: string) => string,
  label: (code: string) => string, propertyName: Map<string, string>
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const sheet = (title: string, cols: [string, number][], rows: unknown[][]) => {
    const ws = wb.addWorksheet(title, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map(([header, width]) => ({ header, width }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(r).alignment = { vertical: "top", wrapText: true };
  };
  const prop = (id: string | null | undefined) => (id && propertyName.get(id)) || "Not set";
  const CATEGORY: Record<Category, string> = {
    NEW: "New lead", EXISTING: "Existing", OTHER_AGENT: "Existing — other agent kept", TASKEZY_NEWER: "Existing — Taskezy newer, kept"
  };
  sheet("Plan", [["Name", 24], ["Phone", 13], ["Type", 26], ["Status now", 16], ["→ Status", 16], ["Agent now", 20], ["→ Agent", 20],
    ["Property now", 26], ["→ Property", 26], ["History to add", 10], ["Why / notes", 50]],
    plans.map(p => [
      p.leadi5.name, p.phone, CATEGORY[p.category],
      p.existing ? label(p.existing.status_code) : "", label(p.statusCode),
      p.existing ? agentName(p.existing.assigned_agent_id) : "", agentName(p.agentId),
      p.existing ? prop(p.existing.property_id) : "", prop(p.propertyId),
      p.logs.length, [p.statusWhy, ...p.flags].filter(Boolean).join(" | ")
    ]));
  sheet("Property differs", [["Name", 24], ["Phone", 13], ["Taskezy (kept)", 30], ["Leadi5 says", 30]],
    plans.filter(p => p.propertyDiffers).map(p => [p.leadi5.name, p.phone, prop(p.existing?.property_id), p.propertyDiffers]));
  sheet("Skipped — no valid mobile", [["Name", 24], ["Phone in Leadi5", 20], ["Status", 16], ["Agent", 20]],
    badPhones.map(l => [l.name, l.phone, l.status, l.assignedTo?.name || ""]));
  await wb.xlsx.writeFile(path.join(DIR, "leadi5-import-plan.xlsx"));
}

run().catch(async (err) => {
  console.error("Leadi5 import failed:", err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
