-- Who downloaded which report (Reports page CSV downloads). The reports are
-- built in the browser, so the page records each download here
-- (reports/reportExports.routes.ts) and Admins see the list in Reports →
-- Download History. One row per download; never changed afterwards.
--
-- user_id goes NULL if the user is later deleted — the name/role snapshot
-- keeps the record readable.
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

CREATE TABLE IF NOT EXISTS report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name_snapshot TEXT NOT NULL,
  role_snapshot TEXT,
  report TEXT NOT NULL,        -- e.g. "Team Reports · Salesperson Site Visit Report"
  file_name TEXT,
  row_count INTEGER,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_exports_created ON report_exports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_exports_user ON report_exports (user_id, created_at DESC);

-- The app connects as taskezy_app; it only ever adds and reads rows.
GRANT SELECT, INSERT ON report_exports TO taskezy_app;
