CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  comparison_count integer NOT NULL DEFAULT 0 CHECK (comparison_count >= 0)
);
INSERT INTO workspaces(id, expires_at) VALUES ('00000000-0000-0000-0000-000000000000', 'infinity');
CREATE INDEX workspaces_expiry_idx ON workspaces(expires_at);
ALTER TABLE policies ADD COLUMN workspace_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES workspaces(id);
ALTER TABLE policies DROP CONSTRAINT policies_name_demo_key;
ALTER TABLE policies ADD CONSTRAINT policies_workspace_name_key UNIQUE (workspace_id, name, demo);
ALTER TABLE comparisons ADD COLUMN workspace_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES workspaces(id);
CREATE INDEX comparisons_workspace_idx ON comparisons(workspace_id, created_at DESC);
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

