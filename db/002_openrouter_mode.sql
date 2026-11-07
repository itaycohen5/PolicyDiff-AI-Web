ALTER TABLE comparisons DROP CONSTRAINT comparisons_mode_check;
ALTER TABLE comparisons ADD CONSTRAINT comparisons_mode_check CHECK (mode IN ('local', 'openai', 'openrouter'));
