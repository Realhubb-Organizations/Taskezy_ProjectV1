/**
 * One-off import of a "Leads" export from the team's previous CRM tool
 * (same 76-column shape as Migration4050.xlsx — full activity history per
 * lead) into this CRM. Originally built for Migration4050.xlsx; the file
 * name is now a CLI arg so the same logic covers any later export in that
 * same shape. See the plan for the full reasoning behind every mapping
 * decision below (status table, Sanjeev Singh -> Super Admin, duplicate
 * handling).
 *
 * Dry run (default, writes nothing):
 *   npx tsx scripts/importMigration4050.ts <filename-in-migrations-archive>
 * Real run:
 *   npx tsx scripts/importMigration4050.ts <filename-in-migrations-archive> --commit
 */
import path from "path";
import ExcelJS from "exceljs";
import { pool, withTransaction } from "../src/db/pool";
import { normalizeIndianMobile } from "../src/modules/leads/leads.repository";
import { createNotification } from "../src/modules/notifications/notifications.service";

const fileArg = process.argv.find(a => !a.startsWith("--") && a.toLowerCase().endsWith(".xlsx"));
const FILE_PATH = path.join(__dirname, "../migrations-archive/", fileArg || "Migration4050.xlsx");
const SUPER_ADMIN_EMAIL = "admin@realhubb.in";
const CHUNK_SIZE = 1000;
const COMMIT = process.argv.includes("--commit");

// Sheet "Assigned User Name" values confirmed by the user not to exactly
// name-match their real account — checked before the general name lookup.
const AGENT_NAME_OVERRIDES: Record<string, string> = {
  "gatla sahith": "sahith@realhubb.in", // real name "Sahith Gatla"
  "neha chourey": "neha@realhubb.in" // real name "Neha Chaurey" (sheet misspells it)
};

// Column positions in ExcelJS's 1-indexed row.values array (index 0 is
// always undefined) — matches the sheet's header row exactly.
const COL = {
  name: 1, phone: 2, email: 4, leadStatus: 6, leadSource: 10, assignedUser: 11,
  campaign: 16, campaignName: 17, projects: 35, builder: 32, receivedOn: 44,
  notes: 46
};

// Reuses migration 030_lead_status_segregation.sql's own OLD->NEW table —
// this sheet comes from the same legacy tool that migration remapped, so
// the same codes reappear here as display labels instead of DB codes.
// One override: NOT_INTERESTED used to collapse into DEAD_LEAD (that
// status didn't exist yet) — it has its own real destination now.
const OLD_STATUS_TO_NEW: Record<string, string> = {
  "new": "NEW_LEAD", "assigned": "NEW_LEAD", "lead pool": "NEW_LEAD", "after rera": "NEW_LEAD",
  "connected": "FOLLOWUP", "interested": "FOLLOWUP", "follow up": "FOLLOWUP", "in negotiation": "FOLLOWUP", "revived": "FOLLOWUP",
  "call back": "CALL_BACK",
  "meeting scheduled": "SITE_VISIT_SCHEDULED", "site visit scheduled": "SITE_VISIT_SCHEDULED",
  "meeting done": "SITE_VISIT_DONE", "site visit done": "SITE_VISIT_DONE", "site visit completed": "SITE_VISIT_DONE",
  "eoi": "EOI",
  "booking done": "BOOKED", "finance review": "BOOKED", "booking approved": "BOOKED", "completed": "BOOKED",
  "finance rejected": "CANCELLED",
  "not interested": "NOT_INTERESTED",
  "invalid": "DEAD_LEAD", "dead": "DEAD_LEAD",
  "low budget": "LOW_BUDGET",
  "other requirement": "OTHER_REQUIREMENT",
  "rnr": "RNR", "switch off": "RNR"
  // "transfer" deliberately excluded — resolved per-row from history, see resolveStatus().
};

function na(v: unknown): string | undefined {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return !s || s.toUpperCase() === "N/A" ? undefined : s;
}

// Sheet's main date columns: "21-10-2026 05:06:15 PM" (DD-MM-YYYY hh:mm:ss AM/PM).
function parseSheetDate(v: unknown): Date | undefined {
  const s = na(v);
  if (!s) return undefined;
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return undefined;
  const [, dd, mm, yyyy, hh12, min, sec, ampm] = m;
  let hh = parseInt(hh12, 10) % 12;
  if (ampm.toUpperCase() === "PM") hh += 12;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hh, Number(min), Number(sec));
  return isNaN(d.getTime()) ? undefined : d;
}

// Notes column's per-line bracket timestamp: "[2026-08-18 13:22] ...".
function parseNoteDate(s: string): Date | undefined {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  const [, yyyy, mm, dd, hh, min] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
  return isNaN(d.getTime()) ? undefined : d;
}

interface NoteLine { timestamp: Date; author: string; message: string }

// "[2026-08-18 13:22] RNR → Transfer (by Sanjeev Singh)" per line. The
// sheet's consolidated Notes column is newest-first; this returns
// chronological (oldest-first) order, matching how a real activity
// timeline should read.
function parseNotes(raw: string | undefined): NoteLine[] {
  if (!raw) return [];
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  const parsed: NoteLine[] = [];
  for (const line of lines) {
    const m = line.match(/^\[(.+?)\]\s*(.+?)\s*\(by (.+?)\)$/);
    if (!m) continue;
    const [, ts, message, author] = m;
    const timestamp = parseNoteDate(ts);
    if (!timestamp) continue;
    parsed.push({ timestamp, author: author.trim(), message: message.trim() });
  }
  return parsed.reverse();
}

// "Transfer" is an admin reassignment action, not a pipeline stage (see
// plan) — resolve it from the status immediately before "Transfer" in
// this lead's own note history instead of a fixed guess.
function resolveStatus(sheetStatus: string, notes: NoteLine[]): { code: string; note: string } {
  const key = sheetStatus.trim().toLowerCase();
  if (key !== "transfer") {
    const code = OLD_STATUS_TO_NEW[key];
    return code ? { code, note: "" } : { code: "NEW_LEAD", note: `unmapped status "${sheetStatus}" -> defaulted to New Lead` };
  }
  // Look for "<prior> → Transfer" among the parsed lines (chronological, so scan from the end).
  for (let i = notes.length - 1; i >= 0; i--) {
    const m = notes[i].message.match(/^(.+?)\s*→\s*Transfer$/i);
    if (m) {
      const priorKey = m[1].trim().toLowerCase();
      const code = OLD_STATUS_TO_NEW[priorKey];
      if (code) return { code, note: `Transfer resolved from prior status "${m[1].trim()}"` };
    }
  }
  return { code: "RNR", note: "Transfer with no resolvable prior status -> defaulted to RNR" };
}

interface ResolvedRow {
  rowNum: number;
  name: string;
  phone: string;
  email: string | undefined;
  statusCode: string;
  statusNote: string;
  assignedAgentId: string;
  assignedAgentUnresolved: string | undefined; // set when the sheet name didn't match any real user
  isUnassigned: boolean;
  propertyId: string | undefined;
  source: string | undefined;
  campaign: string | undefined;
  createdAt: Date;
  notes: NoteLine[];
}

async function run(): Promise<void> {
  console.log(`== Migration4050 import — ${COMMIT ? "COMMIT" : "DRY RUN"} ==`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE_PATH);
  const ws = wb.worksheets[0];

  const { rows: userRows } = await pool.query<{ id: string; name: string; email: string }>(
    `SELECT id, (first_name || COALESCE(' ' || last_name, '')) AS name, email FROM users WHERE status = 'ACTIVE'`
  );
  const userByName = new Map(userRows.map(u => [u.name.trim().toLowerCase(), u.id]));
  const userByEmail = new Map(userRows.map(u => [u.email.toLowerCase(), u.id]));
  const superAdmin = userRows.find(u => u.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase());
  if (!superAdmin) {
    console.error(`Could not find an active user with email ${SUPER_ADMIN_EMAIL} — aborting.`);
    process.exit(1);
  }

  const { rows: propertyRows } = await pool.query<{ id: string; name: string }>(`SELECT id, name FROM properties`);
  const propertyByName = new Map(propertyRows.map(p => [p.name.trim().toLowerCase(), p.id]));

  const resolved: ResolvedRow[] = [];
  const unresolvedAgents = new Map<string, number>();
  let skippedNoPhone = 0;

  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i).values as unknown[];
    const rawPhone = na(row[COL.phone]);
    const normalizedPhone = rawPhone ? normalizeIndianMobile(rawPhone) : undefined;
    if (!normalizedPhone) { skippedNoPhone++; continue; }

    const notes = parseNotes(na(row[COL.notes]));
    const sheetStatus = na(row[COL.leadStatus]) || "New";
    const { code: statusCode, note: statusNote } = resolveStatus(sheetStatus, notes);

    const assignedRaw = na(row[COL.assignedUser]) || "Unassigned";
    let assignedAgentId: string;
    let assignedAgentUnresolved: string | undefined;
    let isUnassigned = false;
    if (assignedRaw.toLowerCase() === "sanjeev singh") {
      assignedAgentId = superAdmin.id; // confirmed not a real working agent — see plan
    } else if (assignedRaw.toLowerCase() === "unassigned") {
      assignedAgentId = superAdmin.id;
      isUnassigned = true; // forces status_code UNASSIGNED below, same sentinel this CRM already uses
    } else {
      const overrideEmail = AGENT_NAME_OVERRIDES[assignedRaw.trim().toLowerCase()];
      const match = (overrideEmail && userByEmail.get(overrideEmail)) || userByName.get(assignedRaw.trim().toLowerCase());
      if (match) {
        assignedAgentId = match;
      } else {
        assignedAgentId = superAdmin.id; // dry-run flags this; never silently guessed on a real --commit run without being reported
        assignedAgentUnresolved = assignedRaw;
        unresolvedAgents.set(assignedRaw, (unresolvedAgents.get(assignedRaw) || 0) + 1);
      }
    }

    const propertyName = (na(row[COL.projects]) || na(row[COL.builder]) || "").trim().toLowerCase();
    const propertyId = propertyName ? propertyByName.get(propertyName) : undefined;

    resolved.push({
      rowNum: i,
      name: na(row[COL.name]) || "Unknown",
      phone: normalizedPhone,
      email: na(row[COL.email]),
      statusCode: isUnassigned ? "UNASSIGNED" : statusCode,
      statusNote,
      assignedAgentId,
      assignedAgentUnresolved,
      isUnassigned,
      propertyId,
      source: na(row[COL.leadSource]),
      campaign: na(row[COL.campaignName]) || na(row[COL.campaign]),
      createdAt: parseSheetDate(row[COL.receivedOn]) || new Date(),
      notes
    });
  }

  // Leads already in the CRM (by phone) — per the user's explicit decision,
  // these are NOT skipped: their status_code gets overwritten with the
  // sheet's resolved status (even if the live lead has since progressed
  // further — the sheet always wins, a deliberate choice) and the sheet's
  // full note history is appended to their existing timeline. Ownership
  // (assigned_agent_id) is left untouched — only the sheet's own newly-
  // created leads use the sheet's resolved agent.
  const { rows: existingLeadRows } = await pool.query<{ id: string; phone: string; assigned_agent_id: string }>(
    `SELECT id, phone, assigned_agent_id FROM leads`
  );
  const existingByPhone = new Map(existingLeadRows.map(r => [r.phone, { id: r.id, assignedAgentId: r.assigned_agent_id }]));
  const withinSheetSeen = new Set<string>();
  let predictedNew = 0;
  let predictedUpdate = 0;
  for (const r of resolved) {
    if (withinSheetSeen.has(r.phone)) continue; // repeated within the sheet itself — first occurrence wins, rest are silently dropped
    withinSheetSeen.add(r.phone);
    if (existingByPhone.has(r.phone)) predictedUpdate++; else predictedNew++;
  }

  const perAgentCount = new Map<string, number>();
  for (const r of resolved) {
    const existing = existingByPhone.get(r.phone);
    const agentId = existing ? existing.assignedAgentId : r.assignedAgentId;
    perAgentCount.set(agentId, (perAgentCount.get(agentId) || 0) + 1);
  }

  console.log(`\nParsed ${resolved.length} importable rows (${skippedNoPhone} skipped — no valid phone number).`);
  console.log(`${predictedNew} will be created as new leads; ${predictedUpdate} already exist (phone match) and will have their status + history updated, not duplicated.`);
  console.log(`\nPer-agent lead counts (by resolved user id — existing leads counted against their current real owner):`);
  for (const [agentId, count] of perAgentCount) {
    const u = userRows.find(x => x.id === agentId);
    console.log(`  ${u ? u.name : agentId}: ${count}`);
  }
  if (unresolvedAgents.size > 0) {
    console.log(`\n⚠ Sheet names that did NOT match any real active user (defaulted to Super Admin — review before committing):`);
    for (const [name, count] of unresolvedAgents) console.log(`  "${name}": ${count} leads`);
  } else {
    console.log(`\nEvery "Assigned User Name" resolved to a real user. ✓`);
  }
  const totalNotes = resolved.reduce((sum, r) => sum + r.notes.length, 0);
  console.log(`\nTotal activity-log lines to be created: ${totalNotes}`);

  if (!COMMIT) {
    console.log(`\nDry run only — nothing written. Re-run with --commit to perform the import.`);
    await pool.end();
    return;
  }

  console.log(`\n== Committing ==`);
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalWithinSheetDupesSkipped = 0;
  const notifyCounts = new Map<string, number>();
  const seenPhonesCommit = new Set<string>();

  for (let i = 0; i < resolved.length; i += CHUNK_SIZE) {
    const chunk = resolved.slice(i, i + CHUNK_SIZE);
    await withTransaction(async (client) => {
      // Split by whether this phone already exists in the CRM — first
      // occurrence within the sheet wins for any phone repeated in the
      // sheet itself (checked against the running seenPhonesCommit set,
      // not just existingByPhone, so a sheet-internal repeat can't be
      // treated as "new" twice).
      const toInsert = chunk.filter(r => !existingByPhone.has(r.phone) && !seenPhonesCommit.has(r.phone));
      const toUpdate = chunk.filter(r => existingByPhone.has(r.phone) && !seenPhonesCommit.has(r.phone));
      totalWithinSheetDupesSkipped += chunk.length - toInsert.length - toUpdate.length;
      for (const r of chunk) seenPhonesCommit.add(r.phone);

      const idByPhone = new Map<string, string>();

      if (toInsert.length > 0) {
        const { rows: inserted } = await client.query<{ id: string; phone: string }>(
          `INSERT INTO leads (name, phone, email, source, campaign, property_id, assigned_agent_id, status_code, assigned_at, created_at)
           SELECT n, p, e, src, camp, prop, agent, status, ts, ts
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::uuid[], $7::uuid[], $8::text[], $9::timestamptz[])
             AS t(n, p, e, src, camp, prop, agent, status, ts)
           ON CONFLICT (phone) DO NOTHING
           RETURNING id, phone`,
          [
            toInsert.map(r => r.name),
            toInsert.map(r => r.phone),
            toInsert.map(r => r.email ?? null),
            toInsert.map(r => r.source ?? null),
            toInsert.map(r => r.campaign ?? null),
            toInsert.map(r => r.propertyId ?? null),
            toInsert.map(r => r.assignedAgentId),
            toInsert.map(r => r.statusCode),
            toInsert.map(r => r.createdAt.toISOString())
          ]
        );
        totalInserted += inserted.length;
        for (const row of inserted) idByPhone.set(row.phone, row.id);
      }

      if (toUpdate.length > 0) {
        const ids = toUpdate.map(r => existingByPhone.get(r.phone)!.id);
        await client.query(
          `UPDATE leads l SET status_code = v.status
           FROM unnest($1::uuid[], $2::text[]) AS v(id, status)
           WHERE l.id = v.id`,
          [ids, toUpdate.map(r => r.statusCode)]
        );
        totalUpdated += toUpdate.length;
        for (const r of toUpdate) idByPhone.set(r.phone, existingByPhone.get(r.phone)!.id);
      }

      const logLeadIds: string[] = [];
      const logUserIds: string[] = [];
      const logUserNames: string[] = [];
      const logMessages: string[] = [];
      const logTimestamps: string[] = [];
      for (const r of [...toInsert, ...toUpdate]) {
        const leadId = idByPhone.get(r.phone);
        if (!leadId) continue; // lost an ON CONFLICT race on a genuinely new row — leave it for a re-run
        const existing = existingByPhone.get(r.phone);
        const notifyAgentId = existing ? existing.assignedAgentId : r.assignedAgentId;
        notifyCounts.set(notifyAgentId, (notifyCounts.get(notifyAgentId) || 0) + 1);
        for (const n of r.notes) {
          logLeadIds.push(leadId);
          logUserIds.push(superAdmin.id); // FK only — user_name_snapshot carries the real original author
          logUserNames.push(n.author);
          logMessages.push(n.message);
          logTimestamps.push(n.timestamp.toISOString());
        }
      }
      if (logLeadIds.length > 0) {
        await client.query(
          `INSERT INTO lead_logs (lead_id, user_id, user_name_snapshot, message, created_at)
           SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::timestamptz[])`,
          [logLeadIds, logUserIds, logUserNames, logMessages, logTimestamps]
        );
      }
    });
    console.log(`  chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${totalInserted} inserted, ${totalUpdated} updated so far`);
  }

  console.log(`\nDone. Inserted ${totalInserted} new leads, updated ${totalUpdated} existing leads, skipped ${totalWithinSheetDupesSkipped} rows repeated within the sheet itself.`);

  console.log(`\nSending one notification per agent...`);
  for (const [agentId, count] of notifyCounts) {
    await createNotification({
      system: "CRM",
      category: "GENERAL",
      title: "Previous Leads Migrated",
      message: `Your ${count} previous CRM lead${count === 1 ? "" : "s"} ${count === 1 ? "has" : "have"} been migrated successfully.`,
      recipientUserId: agentId,
      link: "/dashboard/crm"
    });
    const u = userRows.find(x => x.id === agentId);
    console.log(`  notified ${u ? u.name : agentId} (${count} leads)`);
  }

  await pool.end();
  console.log(`\n== Import complete ==`);
}

run().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
