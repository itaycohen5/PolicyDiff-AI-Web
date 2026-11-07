CREATE TABLE request_budgets (
  subject text NOT NULL CHECK (length(subject) = 64),
  action text NOT NULL CHECK (action IN ('workspace', 'upload', 'ingest', 'comparison', 'source', 'demo')),
  window_start bigint NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  PRIMARY KEY (subject, action, window_start)
);
CREATE INDEX request_budgets_expiry ON request_budgets(window_start);
ALTER TABLE request_budgets ENABLE ROW LEVEL SECURITY;
