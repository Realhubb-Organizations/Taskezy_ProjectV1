-- Finance → Sales Tracker. Three tables, following the Sales Tracker data
-- dictionary:
--   booked_users        — one row per booking (lead + property + salesperson).
--   brokerage_details   — the brokerage for each type on a booking
--                         (Basic / NRI / AOP, each at most once per booking).
--   brokerage_payments  — a brokerage split into invoices/payments.
--
-- Statuses that are set by the server, never by hand:
--   brokerage_details.status   PENDING     — every payment still Pending (or none yet)
--                              IN_PROGRESS — any payment moved on (incl. Rejected)
--                              CLOSED      — completed payments cover the full brokerage value
--   booked_users.payment_status ACTIVE / CLOSED (CLOSED once every selected
--                              brokerage type has a CLOSED brokerage row).
-- Set by hand, forward only: brokerage_payments.payment_status
--   PENDING → INVOICE_RAISED → (GST_PENDING) → COMPLETED, or REJECTED from any
--   step before Completed. A Rejected payment's amount is freed so it can be
--   invoiced again; the booking can't close until that money is received.
-- Brokerage types: BASIC / NRI / AOP plus any added in the tracker
-- (sales_tracker_options), so they're not limited by a CHECK.
--
-- Nothing is ever deleted — a booking is cancelled instead (is_cancelled).
-- Names are kept as text next to the ids so a row stays readable if the
-- lead, user or property is later deleted (the ids go NULL).
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

CREATE TABLE IF NOT EXISTS booked_users (
  booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  property_name TEXT NOT NULL,
  employee_id UUID REFERENCES users(id) ON DELETE SET NULL, -- the salesperson (users.id)
  salesperson_name TEXT NOT NULL,
  lead_name TEXT NOT NULL,                                  -- full name, as saved on the lead
  lead_phone_number TEXT NOT NULL,
  brokerage_type TEXT[] NOT NULL CHECK (cardinality(brokerage_type) > 0),
  unit_number TEXT NOT NULL,
  bhk_type TEXT NOT NULL,
  property_area NUMERIC(10,2) CHECK (property_area IS NULL OR property_area > 0), -- sq ft, typed in
  source TEXT,                                              -- typed in (e.g. Referral)
  agreement_value NUMERIC(14,2) NOT NULL CHECK (agreement_value > 0),
  cashback BOOLEAN NOT NULL DEFAULT false,
  cashback_amount NUMERIC(14,2) CHECK (cashback_amount IS NULL OR cashback_amount >= 0),
  payment_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (payment_status IN ('ACTIVE','CLOSED')),
  booking_month DATE NOT NULL,                              -- first day of the booking date's month
  booking_date DATE NOT NULL,
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booked_users_booking_date ON booked_users (booking_date DESC);
CREATE INDEX IF NOT EXISTS idx_booked_users_property ON booked_users (property_id);
CREATE INDEX IF NOT EXISTS idx_booked_users_employee ON booked_users (employee_id);
CREATE INDEX IF NOT EXISTS idx_booked_users_lead ON booked_users (lead_id);

CREATE TABLE IF NOT EXISTS brokerage_details (
  brokerage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES booked_users(booking_id),
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  brokerage_type TEXT NOT NULL,
  broker_percentage NUMERIC(7,4) NOT NULL CHECK (broker_percentage > 0 AND broker_percentage <= 100),
  value NUMERIC(14,2) NOT NULL CHECK (value > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','CLOSED')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_date DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, brokerage_type)
);

CREATE INDEX IF NOT EXISTS idx_brokerage_details_booking ON brokerage_details (booking_id);

CREATE TABLE IF NOT EXISTS brokerage_payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brokerage_id UUID NOT NULL REFERENCES brokerage_details(brokerage_id),
  brokerage_type TEXT NOT NULL,
  brokerage_percentage NUMERIC(7,4) NOT NULL CHECK (brokerage_percentage > 0 AND brokerage_percentage <= 100),
  brokerage_value NUMERIC(14,2) NOT NULL CHECK (brokerage_value > 0),
  payment_status TEXT NOT NULL DEFAULT 'PENDING'
    CONSTRAINT brokerage_payments_payment_status_check
    CHECK (payment_status IN ('PENDING','INVOICE_RAISED','GST_PENDING','COMPLETED','REJECTED')),
  invoice_number TEXT NOT NULL CHECK (btrim(invoice_number) <> ''),  -- typed in when the payment is created
  invoice_raised_date DATE,
  payment_received_date DATE,
  -- Tax on the brokerage amount, worked out by the server: IGST 18%, or CGST 9% + SGST 9%.
  tax_type TEXT CHECK (tax_type IN ('IGST','CGST_SGST')),
  igst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2),               -- brokerage amount + tax
  rejected_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The dates each step needs are always there once it's reached.
  CONSTRAINT brokerage_payments_check
    CHECK (payment_status IN ('PENDING','REJECTED') OR invoice_raised_date IS NOT NULL),
  CONSTRAINT brokerage_payments_check1
    CHECK (payment_status <> 'COMPLETED' OR payment_received_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_brokerage_payments_brokerage ON brokerage_payments (brokerage_id);

-- Columns added after the first local run of this file (no-ops on a fresh run).
ALTER TABLE booked_users ADD COLUMN IF NOT EXISTS property_area NUMERIC(10,2) CHECK (property_area IS NULL OR property_area > 0);
ALTER TABLE booked_users ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE brokerage_payments ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE brokerage_payments ALTER COLUMN invoice_number SET NOT NULL;

-- Spec update: custom brokerage types, GST Pending / Rejected, tax (no-ops on a fresh run).
ALTER TABLE booked_users DROP CONSTRAINT IF EXISTS booked_users_brokerage_type_check;
ALTER TABLE booked_users ADD CONSTRAINT booked_users_brokerage_type_check CHECK (cardinality(brokerage_type) > 0);
ALTER TABLE brokerage_details DROP CONSTRAINT IF EXISTS brokerage_details_brokerage_type_check;
ALTER TABLE brokerage_payments DROP CONSTRAINT IF EXISTS brokerage_payments_brokerage_type_check;
ALTER TABLE brokerage_payments DROP CONSTRAINT IF EXISTS brokerage_payments_payment_status_check;
ALTER TABLE brokerage_payments ADD CONSTRAINT brokerage_payments_payment_status_check
  CHECK (payment_status IN ('PENDING','INVOICE_RAISED','GST_PENDING','COMPLETED','REJECTED'));
ALTER TABLE brokerage_payments DROP CONSTRAINT IF EXISTS brokerage_payments_check;
ALTER TABLE brokerage_payments ADD CONSTRAINT brokerage_payments_check
  CHECK (payment_status IN ('PENDING','REJECTED') OR invoice_raised_date IS NOT NULL);
ALTER TABLE brokerage_payments ADD COLUMN IF NOT EXISTS tax_type TEXT CHECK (tax_type IN ('IGST','CGST_SGST'));
ALTER TABLE brokerage_payments ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE brokerage_payments ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE brokerage_payments ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE brokerage_payments ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2);
ALTER TABLE brokerage_payments ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- Property types and brokerage types added by hand in the tracker
-- (on top of 1–4 BHK / Villa / Plot and Basic / NRI / AOP).
CREATE TABLE IF NOT EXISTS sales_tracker_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('PROPERTY_TYPE','BROKERAGE_TYPE')),
  value TEXT NOT NULL CHECK (btrim(value) <> ''),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tracker_options ON sales_tracker_options (kind, lower(value));

-- Booking Approval: a lead marked Booked waits (no row = Pending) until a
-- tracker user approves or rejects it. Only APPROVED leads can be picked in
-- Create Booking; REJECTED shows only on the Booking Approval page. The
-- lead's own status is never touched. Marking the lead Booked again later
-- clears a rejection so it's reviewed afresh (leads.service.ts).
DROP TABLE IF EXISTS booking_approval_rejections;  -- earlier local drafts
DROP TABLE IF EXISTS booking_approvals;
CREATE TABLE IF NOT EXISTS booking_approval_decisions (
  lead_id UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_by_name TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bookings list is ordered by last activity.
CREATE INDEX IF NOT EXISTS idx_booked_users_updated_at ON booked_users (updated_at DESC);

-- The app connects as taskezy_app; it adds, reads and edits rows, never deletes.
GRANT SELECT, INSERT, UPDATE ON booked_users, brokerage_details, brokerage_payments TO taskezy_app;
GRANT SELECT, INSERT ON sales_tracker_options TO taskezy_app;
GRANT SELECT, INSERT, DELETE ON booking_approval_decisions TO taskezy_app;
