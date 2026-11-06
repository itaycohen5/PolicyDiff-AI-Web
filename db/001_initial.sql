CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  demo boolean NOT NULL DEFAULT false,
  UNIQUE (name, demo)
);

CREATE TABLE versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES policies(id),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  effective_on date NOT NULL,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  pdf bytea NOT NULL CHECK (octet_length(pdf) BETWEEN 5 AND 12582912),
  source_url text,
  page_count integer CHECK (page_count > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, sha256),
  UNIQUE (policy_id, label),
  UNIQUE (policy_id, id)
);

CREATE TABLE ingestion_jobs (
  version_id uuid PRIMARY KEY REFERENCES versions(id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claim uuid,
  lease_until timestamptz,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'processing') = (claim IS NOT NULL AND lease_until IS NOT NULL))
);

CREATE TABLE chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES versions(id),
  ordinal integer NOT NULL,
  page integer NOT NULL CHECK (page > 0),
  section text NOT NULL,
  body text NOT NULL CHECK (length(body) > 0),
  terms tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED,
  embedding vector(384) NOT NULL,
  UNIQUE (version_id, ordinal),
  UNIQUE (version_id, id, page)
);
CREATE INDEX chunks_section_idx ON chunks (version_id, section);
CREATE INDEX chunks_terms_idx ON chunks USING gin (terms);

CREATE TABLE comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES policies(id),
  old_id uuid NOT NULL,
  new_id uuid NOT NULL,
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 400),
  mode text NOT NULL CHECK (mode IN ('local','openai')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (old_id <> new_id),
  FOREIGN KEY (policy_id, old_id) REFERENCES versions(policy_id, id),
  FOREIGN KEY (policy_id, new_id) REFERENCES versions(policy_id, id),
  UNIQUE (id, old_id, new_id)
);
CREATE INDEX comparison_time_idx ON comparisons (created_at DESC);

CREATE TABLE findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id uuid NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
  position integer NOT NULL,
  section text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('added','removed','changed','review')),
  description text NOT NULL,
  UNIQUE (comparison_id, position),
  UNIQUE (comparison_id, id)
);

CREATE TABLE sources (
  comparison_id uuid NOT NULL,
  finding_id uuid NOT NULL,
  old_id uuid NOT NULL,
  new_id uuid NOT NULL,
  side text NOT NULL CHECK (side IN ('old','new')),
  version_id uuid NOT NULL,
  chunk_id uuid NOT NULL,
  page integer NOT NULL,
  PRIMARY KEY (finding_id, side, chunk_id),
  CHECK ((side = 'old' AND version_id = old_id) OR (side = 'new' AND version_id = new_id)),
  FOREIGN KEY (comparison_id, finding_id) REFERENCES findings(comparison_id, id) ON DELETE CASCADE,
  FOREIGN KEY (comparison_id, old_id, new_id) REFERENCES comparisons(id, old_id, new_id),
  FOREIGN KEY (version_id, chunk_id, page) REFERENCES chunks(version_id, id, page)
);
