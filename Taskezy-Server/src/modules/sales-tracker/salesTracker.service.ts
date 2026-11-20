import { PoolClient } from "pg";
import { query, withTransaction } from "../../db/pool";
import { ApiError } from "../../utils/ApiError";

// Finance → Sales Tracker (see migrations-archive/057_sales_tracker.sql for
// the tables and the status rules). Statuses on brokerage_details and
// booked_users.payment_status are always recomputed here after a write —
// never accepted from the client.

// BASIC / NRI / AOP, or a type added in the tracker (sales_tracker_options).
export type BrokerageType = string;
export type PaymentStatus = "PENDING" | "INVOICE_RAISED" | "GST_PENDING" | "COMPLETED" | "REJECTED";
export type TaxType = "IGST" | "CGST_SGST";

const BUILT_IN_BROKERAGE_TYPES = ["BASIC", "NRI", "AOP"];
const BUILT_IN_PROPERTY_TYPES = ["1 BHK", "2 BHK", "3 BHK", "4 BHK", "Villa", "Plot"];

export interface TrackerFilters {
  search?: string;
  propertyId?: string[];
  salespersonId?: string[];
  brokerageType?: BrokerageType[];
  status?: string[];
  from?: string;
  to?: string;
  month?: string; // YYYY-MM
}

const BUILT_IN_LABEL: Record<string, string> = { BASIC: "Basic", NRI: "NRI", AOP: "AOP" };
const typeLabel = (t: BrokerageType) => BUILT_IN_LABEL[t] ?? t;

// An "invoice out" payment: raised, or raised and waiting on GST.
const INVOICED_SQL = `payment_status IN ('INVOICE_RAISED','GST_PENDING')`;
// A Rejected payment's amount is freed to be invoiced again.
const ALLOCATED_SQL = `payment_status <> 'REJECTED'`;

const round2 = (v: number) => Math.round(v * 100) / 100;
/** Tax on a brokerage amount: IGST 18%, or CGST 9% + SGST 9%. */
function taxFor(value: number, taxType: TaxType | null | undefined) {
  const igst = taxType === "IGST" ? round2(value * 0.18) : 0;
  const cgst = taxType === "CGST_SGST" ? round2(value * 0.09) : 0;
  const sgst = cgst;
  return { igst, cgst, sgst, total: round2(value + igst + cgst + sgst) };
}

// Money compared in paise so 0.1 + 0.2 style float error can never block a
// payment that exactly uses up the brokerage.
const paise = (v: number | string) => Math.round(Number(v) * 100);
const pct = (v: number | string) => Math.round(Number(v) * 10000);

/** WHERE conditions on booked_users (alias b) shared by every list and the Overview totals. */
function bookingConditions(f: TrackerFilters, params: unknown[]): string[] {
  const c: string[] = [];
  if (f.search) {
    params.push(`%${f.search}%`);
    const p = `$${params.length}`;
    c.push(`(b.lead_name ILIKE ${p} OR b.lead_phone_number ILIKE ${p} OR b.unit_number ILIKE ${p} OR b.property_name ILIKE ${p} OR b.salesperson_name ILIKE ${p})`);
  }
  if (f.propertyId?.length) {
    params.push(f.propertyId);
    c.push(`b.property_id = ANY($${params.length}::uuid[])`);
  }
  if (f.salespersonId?.length) {
    params.push(f.salespersonId);
    c.push(`b.employee_id = ANY($${params.length}::uuid[])`);
  }
  if (f.from) {
    params.push(f.from);
    c.push(`b.booking_date >= $${params.length}::date`);
  }
  if (f.to) {
    params.push(f.to);
    c.push(`b.booking_date <= $${params.length}::date`);
  }
  if (f.month) {
    params.push(`${f.month}-01`);
    c.push(`b.booking_month = $${params.length}::date`);
  }
  return c;
}

const where = (c: string[]) => (c.length ? `WHERE ${c.join(" AND ")}` : "");

// ---------------------------------------------------------------------------
// Status recomputation
// ---------------------------------------------------------------------------

async function recomputeBooking(client: PoolClient, bookingId: string): Promise<void> {
  await client.query(
    `UPDATE booked_users b
        SET payment_status = CASE WHEN NOT EXISTS (
              SELECT 1 FROM unnest(b.brokerage_type) t
              WHERE NOT EXISTS (
                SELECT 1 FROM brokerage_details d
                WHERE d.booking_id = b.booking_id AND d.brokerage_type = t AND d.status = 'CLOSED'
              )
            ) THEN 'CLOSED' ELSE 'ACTIVE' END,
            updated_at = now()
      WHERE b.booking_id = $1`,
    [bookingId]
  );
}

async function recomputeBrokerage(client: PoolClient, brokerageId: string): Promise<void> {
  const { rows } = await client.query<{ booking_id: string }>(
    `UPDATE brokerage_details d
        SET status = CASE
              WHEN COALESCE(p.received, 0) >= d.value THEN 'CLOSED'
              WHEN COALESCE(p.raised, 0) > 0 THEN 'IN_PROGRESS'
              ELSE 'PENDING' END,
            updated_at = now()
       FROM (
         SELECT SUM(brokerage_value) FILTER (WHERE payment_status = 'COMPLETED') AS received,
                count(*) FILTER (WHERE payment_status <> 'PENDING') AS raised
         FROM brokerage_payments WHERE brokerage_id = $1
       ) p
      WHERE d.brokerage_id = $1
      RETURNING d.booking_id`,
    [brokerageId]
  );
  if (rows[0]) await recomputeBooking(client, rows[0].booking_id);
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** Leads whose status is Booked — the only leads a booking can be made for. */
export async function listBookedLeads() {
  const { rows } = await query(
    `SELECT l.id, l.name, l.phone, l.property_id, p.name AS property_name, l.assigned_agent_id,
            a.first_name || COALESCE(' ' || a.last_name, '') AS agent_name,
            l.notes,
            -- When it was marked Booked (its last such status change), for Booking Approval's Requested Date.
            COALESCE(
              (SELECT g.created_at FROM lead_logs g
                WHERE g.lead_id = l.id AND g.message = 'Status changed to "BOOKED"'
                ORDER BY g.created_at DESC LIMIT 1),
              l.updated_at
            ) AS booked_at,
            EXISTS (SELECT 1 FROM booked_users b WHERE b.lead_id = l.id AND NOT b.is_cancelled) AS has_booking,
            COALESCE(ap.decision, 'PENDING') AS approval, ap.decided_at, ap.decided_by_name
       FROM leads l
       LEFT JOIN properties p ON p.id = l.property_id
       LEFT JOIN users a ON a.id = l.assigned_agent_id
       LEFT JOIN booking_approval_decisions ap ON ap.lead_id = l.id
      WHERE l.status_code = 'BOOKED'
      ORDER BY l.name
      LIMIT 5000`
  );
  return rows;
}

export async function listLookups() {
  const [properties, users, options] = await Promise.all([
    query(`SELECT id, name FROM properties ORDER BY name`),
    query(
      `SELECT id, first_name || COALESCE(' ' || last_name, '') AS name
         FROM users WHERE status = 'ACTIVE' ORDER BY first_name, last_name`
    ),
    query<{ kind: string; value: string }>(`SELECT kind, value FROM sales_tracker_options ORDER BY created_at`)
  ]);
  const added = (kind: string) => options.rows.filter(o => o.kind === kind).map(o => o.value);
  return {
    properties: properties.rows,
    users: users.rows,
    propertyTypes: [...BUILT_IN_PROPERTY_TYPES, ...added("PROPERTY_TYPE")],
    // Built-ins are codes (BASIC…) shown with their label; added ones are their own label.
    brokerageTypes: [
      ...BUILT_IN_BROKERAGE_TYPES.map(v => ({ value: v, label: typeLabel(v) })),
      ...added("BROKERAGE_TYPE").map(v => ({ value: v, label: v }))
    ]
  };
}

/** Saves a property type or brokerage type typed in the tracker, so it's in the dropdown next time. */
export async function addOption(kind: "PROPERTY_TYPE" | "BROKERAGE_TYPE", value: string, userId: string) {
  const v = value.trim();
  const builtIns = kind === "PROPERTY_TYPE" ? BUILT_IN_PROPERTY_TYPES : [...BUILT_IN_BROKERAGE_TYPES, ...Object.values(BUILT_IN_LABEL)];
  if (builtIns.some(b => b.toLowerCase() === v.toLowerCase())) throw ApiError.conflict(`"${v}" is already in the list.`);
  try {
    await query(`INSERT INTO sales_tracker_options (kind, value, created_by) VALUES ($1, $2, $3)`, [kind, v, userId]);
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
      throw ApiError.conflict(`"${v}" is already in the list.`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Booking Approval
// ---------------------------------------------------------------------------

/**
 * Approves or rejects a Booked lead's request. Approved → it can be picked in
 * Create Booking; Rejected → it only shows as Rejected on Booking Approval.
 * Final either way; the lead itself isn't touched.
 */
export async function decideBooking(leadId: string, decision: "APPROVED" | "REJECTED", user: { id: string; name: string }) {
  const lead = await query<{ status_code: string }>(`SELECT status_code FROM leads WHERE id = $1`, [leadId]);
  if (!lead.rows[0]) throw ApiError.notFound("Lead not found");
  if (lead.rows[0].status_code !== "BOOKED") throw ApiError.badRequest("Only Booked leads wait for approval.");
  const { rowCount } = await query(
    `INSERT INTO booking_approval_decisions (lead_id, decision, decided_by, decided_by_name) VALUES ($1, $2, $3, $4)
     ON CONFLICT (lead_id) DO NOTHING`,
    [leadId, decision, user.id, user.name]
  );
  if (!rowCount) throw ApiError.conflict("This booking request is already approved or rejected.");
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getSummary(f: TrackerFilters) {
  const params: unknown[] = [];
  const c = ["NOT b.is_cancelled", ...bookingConditions(f, params)];
  const { rows } = await query<Record<string, string>>(
    `WITH b AS (SELECT b.booking_id FROM booked_users b ${where(c)}),
          d AS (SELECT d.brokerage_id, d.value FROM brokerage_details d JOIN b USING (booking_id)),
          p AS (SELECT p.brokerage_value, p.payment_status FROM brokerage_payments p JOIN d USING (brokerage_id))
     SELECT (SELECT count(*) FROM b) AS total_bookings,
            (SELECT COALESCE(SUM(value), 0) FROM d) AS total_brokerage,
            (SELECT COALESCE(SUM(brokerage_value) FILTER (WHERE payment_status = 'COMPLETED'), 0) FROM p) AS received,
            (SELECT COALESCE(SUM(brokerage_value) FILTER (WHERE ${INVOICED_SQL}), 0) FROM p) AS invoice_raised`,
    params
  );
  const r = rows[0];
  const totalBrokerage = Number(r.total_brokerage);
  const received = Number(r.received);
  return {
    totalBookings: Number(r.total_bookings),
    totalBrokerage,
    received,
    outstanding: Math.max(0, totalBrokerage - received),
    invoiceRaised: Number(r.invoice_raised)
  };
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

/**
 * One status for the whole booking, shown as its "Payment Status":
 * Pending (every payment still Pending) / In Progress (any payment moved on,
 * Rejected included — that money is still owed) / Closed (all its brokerage
 * received) / Cancelled.
 */
const STAGE_SQL = `
  CASE WHEN b.is_cancelled THEN 'CANCELLED'
       WHEN b.payment_status = 'CLOSED' THEN 'CLOSED'
       WHEN EXISTS (
         SELECT 1 FROM brokerage_payments sp JOIN brokerage_details sd ON sd.brokerage_id = sp.brokerage_id
          WHERE sd.booking_id = b.booking_id AND sp.payment_status <> 'PENDING'
       ) THEN 'IN_PROGRESS'
       ELSE 'PENDING' END`;

const BOOKING_COLUMNS = `
  b.booking_id, b.lead_id, b.property_id, b.property_name, b.employee_id, b.salesperson_name,
  b.lead_name, b.lead_phone_number, b.brokerage_type, b.unit_number, b.bhk_type, b.agreement_value,
  b.property_area, b.source, b.cashback, b.cashback_amount, b.payment_status, b.booking_month, b.booking_date,
  b.is_cancelled, b.cancelled_at, b.created_at, b.updated_at,
  (SELECT l.email FROM leads l WHERE l.id = b.lead_id) AS lead_email,
  ${STAGE_SQL} AS stage`;

const BROKERAGE_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object(
             'brokerageId', d.brokerage_id, 'type', d.brokerage_type, 'percentage', d.broker_percentage,
             'value', d.value, 'status', d.status, 'allocated', COALESCE(p.allocated, 0),
             'allocatedPercentage', COALESCE(p.allocated_pct, 0), 'received', COALESCE(p.received, 0),
             'invoiced', COALESCE(p.invoiced, 0), 'paymentCount', COALESCE(p.cnt, 0)
           ) ORDER BY array_position(ARRAY['BASIC','NRI','AOP'], d.brokerage_type)) AS items,
           SUM(d.value) AS total_value,
           SUM(COALESCE(p.received, 0)) AS received,
           SUM(COALESCE(p.invoiced, 0)) AS invoiced
      FROM brokerage_details d
      LEFT JOIN LATERAL (
        SELECT SUM(brokerage_value) FILTER (WHERE ${ALLOCATED_SQL}) AS allocated,
               SUM(brokerage_percentage) FILTER (WHERE ${ALLOCATED_SQL}) AS allocated_pct,
               SUM(brokerage_value) FILTER (WHERE payment_status = 'COMPLETED') AS received,
               SUM(brokerage_value) FILTER (WHERE ${INVOICED_SQL}) AS invoiced, count(*) AS cnt
          FROM brokerage_payments WHERE brokerage_id = d.brokerage_id
      ) p ON true
     WHERE d.booking_id = b.booking_id
  ) br ON true`;

export async function listBookings(f: TrackerFilters, page: number, pageSize: number) {
  const params: unknown[] = [];
  const c = bookingConditions(f, params);
  if (f.brokerageType?.length) {
    params.push(f.brokerageType);
    c.push(`b.brokerage_type && $${params.length}::text[]`);
  }
  if (f.status?.length) {
    const s: string[] = [];
    const stages = f.status.filter(v => ["PENDING", "IN_PROGRESS", "CLOSED", "CANCELLED"].includes(v));
    if (stages.length) {
      params.push(stages);
      s.push(`(${STAGE_SQL}) = ANY($${params.length}::text[])`);
    }
    // Overview card lists: bookings with money received / still to come / invoices out.
    const paid = `(SELECT COALESCE(SUM(p.brokerage_value), 0) FROM brokerage_payments p JOIN brokerage_details d ON d.brokerage_id = p.brokerage_id
                   WHERE d.booking_id = b.booking_id AND p.payment_status = 'COMPLETED')`;
    if (f.status.includes("HAS_BROKERAGE")) s.push(`(NOT b.is_cancelled AND EXISTS (SELECT 1 FROM brokerage_details d WHERE d.booking_id = b.booking_id))`);
    if (f.status.includes("HAS_RECEIVED")) s.push(`(NOT b.is_cancelled AND ${paid} > 0)`);
    if (f.status.includes("HAS_OUTSTANDING")) {
      s.push(`(NOT b.is_cancelled AND (SELECT COALESCE(SUM(d.value), 0) FROM brokerage_details d WHERE d.booking_id = b.booking_id) > ${paid})`);
    }
    if (f.status.includes("HAS_INVOICE")) {
      s.push(`(NOT b.is_cancelled AND EXISTS (SELECT 1 FROM brokerage_payments p JOIN brokerage_details d ON d.brokerage_id = p.brokerage_id
                WHERE d.booking_id = b.booking_id AND p.${INVOICED_SQL}))`);
    }
    if (f.status.includes("BROKERAGE_MISSING")) {
      s.push(`(NOT b.is_cancelled AND EXISTS (
        SELECT 1 FROM unnest(b.brokerage_type) t
        WHERE NOT EXISTS (SELECT 1 FROM brokerage_details d WHERE d.booking_id = b.booking_id AND d.brokerage_type = t)))`);
    }
    if (s.length) c.push(`(${s.join(" OR ")})`);
  }

  const count = await query<{ count: string }>(`SELECT count(*) FROM booked_users b ${where(c)}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query(
    `SELECT ${BOOKING_COLUMNS},
            COALESCE(br.items, '[]'::json) AS brokerages,
            COALESCE(br.total_value, 0) AS total_brokerage,
            COALESCE(br.received, 0) AS received,
            COALESCE(br.invoiced, 0) AS invoiced
       FROM booked_users b
       ${BROKERAGE_LATERAL}
       ${where(c)}
      ORDER BY b.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { rows, totalCount: Number(count.rows[0]?.count ?? 0) };
}

export async function getBooking(bookingId: string) {
  const { rows } = await query(
    `SELECT ${BOOKING_COLUMNS},
            COALESCE(br.items, '[]'::json) AS brokerages,
            COALESCE(br.total_value, 0) AS total_brokerage,
            COALESCE(br.received, 0) AS received,
            COALESCE(br.invoiced, 0) AS invoiced
       FROM booked_users b
       ${BROKERAGE_LATERAL}
      WHERE b.booking_id = $1`,
    [bookingId]
  );
  if (!rows[0]) throw ApiError.notFound("Booking not found");
  const payments = await query(
    `SELECT p.payment_id, p.brokerage_id, p.brokerage_type, p.brokerage_percentage, p.brokerage_value,
            p.payment_status, p.invoice_number, p.invoice_raised_date, p.payment_received_date, p.created_at,
            p.tax_type, p.igst_amount, p.cgst_amount, p.sgst_amount,
            COALESCE(p.total_amount, p.brokerage_value) AS total_amount, p.rejected_at
       FROM brokerage_payments p
       JOIN brokerage_details d ON d.brokerage_id = p.brokerage_id
      WHERE d.booking_id = $1
      ORDER BY p.created_at`,
    [bookingId]
  );
  return { ...rows[0], payments: payments.rows };
}

export interface BookingInput {
  leadId: string;
  propertyId: string;
  salespersonId: string;
  bhkType: string;
  unitNumber: string;
  agreementValue: number;
  brokerageType: BrokerageType[];
  cashback: boolean;
  cashbackAmount?: number | null;
  bookingDate: string;
  propertyArea?: number | null;
  source?: string | null;
}

/** Resolves the names stored next to the ids (lead name/phone, property, salesperson). */
async function resolveBookingNames(client: PoolClient, input: BookingInput) {
  const lead = await client.query<{ name: string; phone: string; status_code: string }>(
    `SELECT name, phone, status_code FROM leads WHERE id = $1`,
    [input.leadId]
  );
  if (!lead.rows[0]) throw ApiError.badRequest("That lead no longer exists.");
  const property = await client.query<{ name: string }>(`SELECT name FROM properties WHERE id = $1`, [input.propertyId]);
  if (!property.rows[0]) throw ApiError.badRequest("That property no longer exists.");
  const user = await client.query<{ name: string }>(
    `SELECT first_name || COALESCE(' ' || last_name, '') AS name FROM users WHERE id = $1`,
    [input.salespersonId]
  );
  if (!user.rows[0]) throw ApiError.badRequest("That salesperson no longer exists.");
  return { lead: lead.rows[0], propertyName: property.rows[0].name, salespersonName: user.rows[0].name };
}

/** Every brokerage type must be Basic / NRI / AOP or one added in the tracker. */
async function assertKnownBrokerageTypes(client: PoolClient, types: BrokerageType[]) {
  const custom = types.filter(t => !BUILT_IN_BROKERAGE_TYPES.includes(t));
  if (!custom.length) return;
  const { rows } = await client.query<{ value: string }>(
    `SELECT value FROM sales_tracker_options WHERE kind = 'BROKERAGE_TYPE' AND value = ANY($1::text[])`,
    [custom]
  );
  const known = new Set(rows.map(r => r.value));
  const unknown = custom.filter(t => !known.has(t));
  if (unknown.length) throw ApiError.badRequest(`Unknown brokerage type: ${unknown.join(", ")}. Add it first.`);
}

/** A booking can only be made for a lead approved in Booking Approval. */
async function assertApproved(client: PoolClient, leadId: string) {
  const { rows } = await client.query(`SELECT 1 FROM booking_approval_decisions WHERE lead_id = $1 AND decision = 'APPROVED'`, [leadId]);
  if (!rows[0]) throw ApiError.badRequest("Approve this lead in Booking Approval first.");
}

export async function createBooking(input: BookingInput, userId: string) {
  return withTransaction(async (client) => {
    await assertKnownBrokerageTypes(client, input.brokerageType);
    const names = await resolveBookingNames(client, input);
    if (names.lead.status_code !== "BOOKED") {
      throw ApiError.badRequest("Only leads with status Booked can be added to the Sales Tracker.");
    }
    await assertApproved(client, input.leadId);
    const { rows } = await client.query<{ booking_id: string }>(
      `INSERT INTO booked_users (
         lead_id, property_id, property_name, employee_id, salesperson_name, lead_name, lead_phone_number,
         brokerage_type, unit_number, bhk_type, agreement_value, cashback, cashback_amount,
         booking_month, booking_date, created_by, property_area, source
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, date_trunc('month', $14::date)::date, $14::date, $15, $16, $17)
       RETURNING booking_id`,
      [
        input.leadId, input.propertyId, names.propertyName, input.salespersonId, names.salespersonName,
        names.lead.name, names.lead.phone, input.brokerageType, input.unitNumber, input.bhkType,
        input.agreementValue, input.cashback, input.cashback ? input.cashbackAmount ?? null : null,
        input.bookingDate, userId, input.propertyArea ?? null, input.source?.trim() || null
      ]
    );
    return rows[0].booking_id;
  });
}

export async function updateBooking(bookingId: string, input: BookingInput) {
  return withTransaction(async (client) => {
    const current = await client.query<{ is_cancelled: boolean; lead_id: string | null }>(
      `SELECT is_cancelled, lead_id FROM booked_users WHERE booking_id = $1 FOR UPDATE`,
      [bookingId]
    );
    if (!current.rows[0]) throw ApiError.notFound("Booking not found");
    if (current.rows[0].is_cancelled) throw ApiError.conflict("A cancelled booking can't be edited.");

    // A brokerage type that already has brokerage details can't be taken off.
    const existing = await client.query<{ brokerage_type: BrokerageType }>(
      `SELECT brokerage_type FROM brokerage_details WHERE booking_id = $1`,
      [bookingId]
    );
    const removed = existing.rows.map(r => r.brokerage_type).filter(t => !input.brokerageType.includes(t));
    if (removed.length) {
      throw ApiError.conflict(
        `${removed.map(t => typeLabel(t)).join(", ")} brokerage is already added for this booking, so it can't be removed.`
      );
    }

    await assertKnownBrokerageTypes(client, input.brokerageType);
    const names = await resolveBookingNames(client, input);
    if (input.leadId !== current.rows[0].lead_id) {
      if (names.lead.status_code !== "BOOKED") {
        throw ApiError.badRequest("Only leads with status Booked can be added to the Sales Tracker.");
      }
      await assertApproved(client, input.leadId);
    }
    await client.query(
      `UPDATE booked_users SET
         lead_id = $2, property_id = $3, property_name = $4, employee_id = $5, salesperson_name = $6,
         lead_name = $7, lead_phone_number = $8, brokerage_type = $9, unit_number = $10, bhk_type = $11,
         agreement_value = $12, cashback = $13, cashback_amount = $14,
         booking_month = date_trunc('month', $15::date)::date, booking_date = $15::date,
         property_area = $16, source = $17, updated_at = now()
       WHERE booking_id = $1`,
      [
        bookingId, input.leadId, input.propertyId, names.propertyName, input.salespersonId, names.salespersonName,
        names.lead.name, names.lead.phone, input.brokerageType, input.unitNumber, input.bhkType,
        input.agreementValue, input.cashback, input.cashback ? input.cashbackAmount ?? null : null, input.bookingDate,
        input.propertyArea ?? null, input.source?.trim() || null
      ]
    );
    // Brokerage rows keep the booking's property.
    await client.query(`UPDATE brokerage_details SET property_id = $2 WHERE booking_id = $1`, [bookingId, input.propertyId]);
    await recomputeBooking(client, bookingId);
  });
}

export async function cancelBooking(bookingId: string, userId: string) {
  const { rowCount } = await query(
    `UPDATE booked_users SET is_cancelled = true, cancelled_at = now(), cancelled_by = $2, updated_at = now()
      WHERE booking_id = $1 AND NOT is_cancelled`,
    [bookingId, userId]
  );
  if (!rowCount) throw ApiError.conflict("This booking is already cancelled.");
}

// ---------------------------------------------------------------------------
// Brokerage details
// ---------------------------------------------------------------------------

export interface BrokerageItemInput {
  type: BrokerageType;
  percentage: number;
  value: number;
}

/** Adds or updates the brokerage % and value for each type on a booking. */
export async function saveBrokerage(bookingId: string, items: BrokerageItemInput[], userId: string) {
  return withTransaction(async (client) => {
    const booking = await client.query<{ is_cancelled: boolean; brokerage_type: BrokerageType[]; property_id: string | null }>(
      `SELECT is_cancelled, brokerage_type, property_id FROM booked_users WHERE booking_id = $1 FOR UPDATE`,
      [bookingId]
    );
    const b = booking.rows[0];
    if (!b) throw ApiError.notFound("Booking not found");
    if (b.is_cancelled) throw ApiError.conflict("This booking is cancelled.");

    for (const item of items) {
      if (!b.brokerage_type.includes(item.type)) {
        throw ApiError.badRequest(`${typeLabel(item.type)} isn't one of this booking's brokerage types.`);
      }
      const existing = await client.query<{ brokerage_id: string; allocated: string; allocated_pct: string }>(
        `SELECT d.brokerage_id,
                COALESCE((SELECT SUM(brokerage_value) FROM brokerage_payments WHERE brokerage_id = d.brokerage_id AND ${ALLOCATED_SQL}), 0) AS allocated,
                COALESCE((SELECT SUM(brokerage_percentage) FROM brokerage_payments WHERE brokerage_id = d.brokerage_id AND ${ALLOCATED_SQL}), 0) AS allocated_pct
           FROM brokerage_details d WHERE d.booking_id = $1 AND d.brokerage_type = $2`,
        [bookingId, item.type]
      );
      const row = existing.rows[0];
      if (row) {
        if (paise(item.value) < paise(row.allocated)) {
          throw ApiError.badRequest(
            `${typeLabel(item.type)} value can't be less than the ₹${Number(row.allocated).toLocaleString("en-IN")} already split into payments.`
          );
        }
        if (pct(item.percentage) < pct(row.allocated_pct)) {
          throw ApiError.badRequest(
            `${typeLabel(item.type)} % can't be less than the ${Number(row.allocated_pct)}% already split into payments.`
          );
        }
        await client.query(
          `UPDATE brokerage_details SET broker_percentage = $2, value = $3, updated_at = now() WHERE brokerage_id = $1`,
          [row.brokerage_id, item.percentage, item.value]
        );
        await recomputeBrokerage(client, row.brokerage_id);
      } else {
        const created = await client.query<{ brokerage_id: string }>(
          `INSERT INTO brokerage_details (booking_id, property_id, brokerage_type, broker_percentage, value, created_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING brokerage_id`,
          [bookingId, b.property_id, item.type, item.percentage, item.value, userId]
        );
        await recomputeBrokerage(client, created.rows[0].brokerage_id);
      }
    }
  });
}

export async function listBrokerages(f: TrackerFilters & { openOnly?: boolean }, page: number, pageSize: number) {
  const params: unknown[] = [];
  const c = ["NOT b.is_cancelled", ...bookingConditions(f, params)];
  if (f.brokerageType?.length) {
    params.push(f.brokerageType);
    c.push(`d.brokerage_type = ANY($${params.length}::text[])`);
  }
  if (f.status?.length) {
    params.push(f.status);
    c.push(`d.status = ANY($${params.length}::text[])`);
  }
  if (f.openOnly) c.push(`COALESCE(p.allocated, 0) < d.value`);

  const from = `
    FROM brokerage_details d
    JOIN booked_users b ON b.booking_id = d.booking_id
    LEFT JOIN LATERAL (
      SELECT SUM(brokerage_value) FILTER (WHERE ${ALLOCATED_SQL}) AS allocated,
             SUM(brokerage_percentage) FILTER (WHERE ${ALLOCATED_SQL}) AS allocated_pct,
             SUM(brokerage_value) FILTER (WHERE payment_status = 'COMPLETED') AS received,
             SUM(brokerage_value) FILTER (WHERE ${INVOICED_SQL}) AS invoiced,
             count(*) AS cnt
        FROM brokerage_payments WHERE brokerage_id = d.brokerage_id
    ) p ON true`;

  const count = await query<{ count: string }>(`SELECT count(*) ${from} ${where(c)}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query(
    `SELECT d.brokerage_id, d.booking_id, d.brokerage_type, d.broker_percentage, d.value, d.status, d.created_date, d.updated_at,
            b.lead_name, b.lead_phone_number, b.property_name, b.unit_number, b.salesperson_name,
            b.agreement_value, b.booking_date,
            COALESCE(p.allocated, 0) AS allocated, COALESCE(p.allocated_pct, 0) AS allocated_percentage,
            COALESCE(p.received, 0) AS received, COALESCE(p.invoiced, 0) AS invoiced, COALESCE(p.cnt, 0) AS payment_count
       ${from}
       ${where(c)}
      ORDER BY b.booking_date DESC, b.created_at DESC, array_position(ARRAY['BASIC','NRI','AOP'], d.brokerage_type)
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { rows, totalCount: Number(count.rows[0]?.count ?? 0) };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function listPayments(f: TrackerFilters, page: number, pageSize: number) {
  const params: unknown[] = [];
  // The search box also finds an invoice number (on top of the booking fields).
  const c = ["NOT b.is_cancelled", ...bookingConditions({ ...f, search: undefined }, params)];
  if (f.search) {
    params.push(`%${f.search}%`);
    const p = `$${params.length}`;
    c.push(`(p.invoice_number ILIKE ${p} OR b.lead_name ILIKE ${p} OR b.lead_phone_number ILIKE ${p} OR b.unit_number ILIKE ${p} OR b.property_name ILIKE ${p})`);
  }
  if (f.brokerageType?.length) {
    params.push(f.brokerageType);
    c.push(`p.brokerage_type = ANY($${params.length}::text[])`);
  }
  if (f.status?.length) {
    params.push(f.status);
    c.push(`p.payment_status = ANY($${params.length}::text[])`);
  }
  const from = `
    FROM brokerage_payments p
    JOIN brokerage_details d ON d.brokerage_id = p.brokerage_id
    JOIN booked_users b ON b.booking_id = d.booking_id`;

  const count = await query<{ count: string }>(`SELECT count(*) ${from} ${where(c)}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query(
    `SELECT p.payment_id, p.brokerage_id, p.brokerage_type, p.brokerage_percentage, p.brokerage_value,
            p.payment_status, p.invoice_number, p.invoice_raised_date, p.payment_received_date, p.created_at,
            p.tax_type, p.igst_amount, p.cgst_amount, p.sgst_amount,
            COALESCE(p.total_amount, p.brokerage_value) AS total_amount, p.rejected_at,
            d.broker_percentage, d.value AS brokerage_total, d.booking_id,
            b.lead_name, b.lead_phone_number, b.property_name, b.unit_number, b.salesperson_name, b.booking_date
       ${from}
       ${where(c)}
      ORDER BY p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { rows, totalCount: Number(count.rows[0]?.count ?? 0) };
}

async function lockBrokerageForPayment(client: PoolClient, brokerageId: string) {
  const { rows } = await client.query<{
    brokerage_type: BrokerageType; broker_percentage: string; value: string; is_cancelled: boolean;
  }>(
    `SELECT d.brokerage_type, d.broker_percentage, d.value, b.is_cancelled
       FROM brokerage_details d JOIN booked_users b ON b.booking_id = d.booking_id
      WHERE d.brokerage_id = $1
      FOR UPDATE OF d`,
    [brokerageId]
  );
  if (!rows[0]) throw ApiError.notFound("Brokerage not found");
  if (rows[0].is_cancelled) throw ApiError.conflict("This booking is cancelled.");
  return rows[0];
}

/** The payments on a brokerage must never add up to more than the brokerage itself. */
async function assertWithinBrokerage(
  client: PoolClient,
  brokerageId: string,
  brokerage: { broker_percentage: string; value: string },
  percentage: number,
  value: number,
  excludePaymentId?: string
) {
  const { rows } = await client.query<{ allocated: string; allocated_pct: string }>(
    `SELECT COALESCE(SUM(brokerage_value), 0) AS allocated, COALESCE(SUM(brokerage_percentage), 0) AS allocated_pct
       FROM brokerage_payments WHERE brokerage_id = $1 AND ${ALLOCATED_SQL} AND ($2::uuid IS NULL OR payment_id <> $2::uuid)`,
    [brokerageId, excludePaymentId ?? null]
  );
  const leftValue = (paise(brokerage.value) - paise(rows[0].allocated)) / 100;
  const leftPct = (pct(brokerage.broker_percentage) - pct(rows[0].allocated_pct)) / 10000;
  if (paise(value) > paise(brokerage.value) - paise(rows[0].allocated)) {
    throw ApiError.badRequest(leftValue > 0 ? `Only ₹${leftValue.toLocaleString("en-IN")} of this brokerage is left to split.` : "This brokerage is already fully split into payments.");
  }
  if (pct(percentage) > pct(brokerage.broker_percentage) - pct(rows[0].allocated_pct)) {
    throw ApiError.badRequest(`Only ${leftPct}% of this brokerage is left to split.`);
  }
}

export async function createPayment(
  input: { brokerageId: string; percentage: number; value: number; invoiceNumber: string; taxType?: TaxType | null },
  userId: string
) {
  return withTransaction(async (client) => {
    const brokerage = await lockBrokerageForPayment(client, input.brokerageId);
    await assertWithinBrokerage(client, input.brokerageId, brokerage, input.percentage, input.value);
    const tax = taxFor(input.value, input.taxType);
    const { rows } = await client.query<{ payment_id: string }>(
      `INSERT INTO brokerage_payments (brokerage_id, brokerage_type, brokerage_percentage, brokerage_value, invoice_number, created_by,
                                       tax_type, igst_amount, cgst_amount, sgst_amount, total_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING payment_id`,
      [input.brokerageId, brokerage.brokerage_type, input.percentage, input.value, input.invoiceNumber.trim(), userId,
       input.taxType ?? null, tax.igst, tax.cgst, tax.sgst, tax.total]
    );
    await recomputeBrokerage(client, input.brokerageId);
    return rows[0].payment_id;
  });
}

async function lockPayment(client: PoolClient, paymentId: string) {
  const { rows } = await client.query<{
    brokerage_id: string; payment_status: PaymentStatus; invoice_raised_date: string | null; payment_received_date: string | null;
    brokerage_value: string; tax_type: TaxType | null;
  }>(
    `SELECT brokerage_id, payment_status, invoice_raised_date, payment_received_date, brokerage_value, tax_type
       FROM brokerage_payments WHERE payment_id = $1 FOR UPDATE`,
    [paymentId]
  );
  if (!rows[0]) throw ApiError.notFound("Payment not found");
  return rows[0];
}

/**
 * Edits a payment. % and value only while it's still Pending (an invoice has
 * already gone out for that amount after that); the invoice date once an
 * invoice is raised, the received date once it's completed.
 */
export async function updatePayment(
  paymentId: string,
  input: {
    percentage?: number; value?: number; invoiceNumber?: string; invoiceRaisedDate?: string; paymentReceivedDate?: string;
    taxType?: TaxType | null;
  }
) {
  return withTransaction(async (client) => {
    const payment = await lockPayment(client, paymentId);
    const brokerage = await lockBrokerageForPayment(client, payment.brokerage_id);
    if (payment.payment_status === "REJECTED") throw ApiError.conflict("A rejected payment can't be edited.");

    if (input.percentage !== undefined || input.value !== undefined) {
      if (payment.payment_status !== "PENDING") {
        throw ApiError.conflict("% and value can only be changed while the payment is Pending.");
      }
      const current = await client.query<{ brokerage_percentage: string; brokerage_value: string }>(
        `SELECT brokerage_percentage, brokerage_value FROM brokerage_payments WHERE payment_id = $1`,
        [paymentId]
      );
      const percentage = input.percentage ?? Number(current.rows[0].brokerage_percentage);
      const value = input.value ?? Number(current.rows[0].brokerage_value);
      await assertWithinBrokerage(client, payment.brokerage_id, brokerage, percentage, value, paymentId);
      await client.query(
        `UPDATE brokerage_payments SET brokerage_percentage = $2, brokerage_value = $3, updated_at = now() WHERE payment_id = $1`,
        [paymentId, percentage, value]
      );
    }

    // The invoice number can be corrected at any step — never emptied (schema).
    if (input.invoiceNumber !== undefined) {
      await client.query(
        `UPDATE brokerage_payments SET invoice_number = $2, updated_at = now() WHERE payment_id = $1`,
        [paymentId, input.invoiceNumber.trim()]
      );
    }

    if (input.invoiceRaisedDate !== undefined) {
      if (payment.payment_status === "PENDING") throw ApiError.conflict("Raise the invoice first.");
      const received = input.paymentReceivedDate ?? payment.payment_received_date;
      if (received && input.invoiceRaisedDate > received) {
        throw ApiError.badRequest("Invoice date can't be after the payment received date.");
      }
      await client.query(
        `UPDATE brokerage_payments SET invoice_raised_date = $2, updated_at = now() WHERE payment_id = $1`,
        [paymentId, input.invoiceRaisedDate]
      );
    }

    if (input.paymentReceivedDate !== undefined) {
      if (payment.payment_status !== "COMPLETED") throw ApiError.conflict("Mark the payment Completed first.");
      const invoiced = input.invoiceRaisedDate ?? payment.invoice_raised_date;
      if (invoiced && input.paymentReceivedDate < invoiced) {
        throw ApiError.badRequest("Payment received date can't be before the invoice date.");
      }
      await client.query(
        `UPDATE brokerage_payments SET payment_received_date = $2, updated_at = now() WHERE payment_id = $1`,
        [paymentId, input.paymentReceivedDate]
      );
    }

    // Tax always follows the current amount and tax choice.
    if (input.taxType !== undefined || input.value !== undefined) {
      const { rows } = await client.query<{ brokerage_value: string; tax_type: TaxType | null }>(
        `SELECT brokerage_value, tax_type FROM brokerage_payments WHERE payment_id = $1`,
        [paymentId]
      );
      const taxType = input.taxType !== undefined ? input.taxType : rows[0].tax_type;
      const tax = taxFor(Number(rows[0].brokerage_value), taxType);
      await client.query(
        `UPDATE brokerage_payments SET tax_type = $2, igst_amount = $3, cgst_amount = $4, sgst_amount = $5, total_amount = $6,
                updated_at = now() WHERE payment_id = $1`,
        [paymentId, taxType, tax.igst, tax.cgst, tax.sgst, tax.total]
      );
    }

    await recomputeBrokerage(client, payment.brokerage_id);
  });
}

/**
 * Moves a payment one step forward: Pending → Invoice Raised → (GST Pending)
 * → Completed. From Invoice Raised, `to` picks GST Pending or straight to
 * Completed. Never back, never skipping the invoice. `date` is the invoice
 * date (→ Invoice Raised) or the payment received date (→ Completed).
 */
export async function advancePayment(paymentId: string, date: string, invoiceNumber?: string, to?: "GST_PENDING" | "COMPLETED") {
  return withTransaction(async (client) => {
    const payment = await lockPayment(client, paymentId);
    await lockBrokerageForPayment(client, payment.brokerage_id);

    if (payment.payment_status === "PENDING") {
      // The number was given when the payment was created; one passed here corrects it.
      await client.query(
        `UPDATE brokerage_payments
            SET payment_status = 'INVOICE_RAISED', invoice_raised_date = $2,
                invoice_number = COALESCE(NULLIF(btrim($3), ''), invoice_number), updated_at = now()
          WHERE payment_id = $1`,
        [paymentId, date, invoiceNumber ?? null]
      );
    } else if (payment.payment_status === "INVOICE_RAISED" && to === "GST_PENDING") {
      await client.query(
        `UPDATE brokerage_payments SET payment_status = 'GST_PENDING', updated_at = now() WHERE payment_id = $1`,
        [paymentId]
      );
    } else if (payment.payment_status === "INVOICE_RAISED" || payment.payment_status === "GST_PENDING") {
      if (payment.invoice_raised_date && date < payment.invoice_raised_date) {
        throw ApiError.badRequest("Payment received date can't be before the invoice date.");
      }
      await client.query(
        `UPDATE brokerage_payments SET payment_status = 'COMPLETED', payment_received_date = $2, updated_at = now()
          WHERE payment_id = $1`,
        [paymentId, date]
      );
    } else if (payment.payment_status === "REJECTED") {
      throw ApiError.conflict("This payment was rejected.");
    } else {
      throw ApiError.conflict("This payment is already completed.");
    }

    await recomputeBrokerage(client, payment.brokerage_id);
  });
}

/**
 * Marks a payment Rejected (from any step before Completed). Its amount is
 * freed so a new payment can be raised for it; the booking stays In
 * Progress until that money is actually received.
 */
export async function rejectPayment(paymentId: string) {
  return withTransaction(async (client) => {
    const payment = await lockPayment(client, paymentId);
    await lockBrokerageForPayment(client, payment.brokerage_id);
    if (payment.payment_status === "COMPLETED") throw ApiError.conflict("A completed payment can't be rejected.");
    if (payment.payment_status === "REJECTED") throw ApiError.conflict("This payment is already rejected.");
    await client.query(
      `UPDATE brokerage_payments SET payment_status = 'REJECTED', rejected_at = now(), updated_at = now() WHERE payment_id = $1`,
      [paymentId]
    );
    await recomputeBrokerage(client, payment.brokerage_id);
  });
}

/**
 * Invoices raised but not yet received, most delayed first. "Delayed by" =
 * days since the invoice was raised (the page shows 1–29 days in yellow,
 * 30+ in red). `invoiceMonth` (YYYY-MM) filters by the invoice date.
 */
export async function listOverdue(f: TrackerFilters & { invoiceMonth?: string }, page: number, pageSize: number) {
  const params: unknown[] = [];
  const c = ["NOT b.is_cancelled", `p.${INVOICED_SQL}`, ...bookingConditions(f, params)];
  if (f.invoiceMonth) {
    params.push(`${f.invoiceMonth}-01`);
    c.push(`date_trunc('month', p.invoice_raised_date) = $${params.length}::date`);
  }
  const from = `
    FROM brokerage_payments p
    JOIN brokerage_details d ON d.brokerage_id = p.brokerage_id
    JOIN booked_users b ON b.booking_id = d.booking_id`;

  const count = await query<{ count: string }>(`SELECT count(*) ${from} ${where(c)}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query(
    `SELECT p.payment_id, p.brokerage_type, p.brokerage_value, p.invoice_number, p.invoice_raised_date,
            (CURRENT_DATE - p.invoice_raised_date) AS days_delayed,
            d.value AS brokerage_total, b.booking_id, b.lead_name, b.property_name, b.agreement_value
       ${from}
       ${where(c)}
      ORDER BY p.invoice_raised_date ASC, p.created_at ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { rows, totalCount: Number(count.rows[0]?.count ?? 0) };
}
