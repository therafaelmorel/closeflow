ALTER TABLE sessions ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id);
