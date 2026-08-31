-- Client roles do not need table-level TRUNCATE, REFERENCES, or TRIGGER privileges.
-- RLS does not make these privileges useful to the browser and TRUNCATE is not row-scoped.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Prevent the same privileges from being inherited by future public tables created by this owner.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
