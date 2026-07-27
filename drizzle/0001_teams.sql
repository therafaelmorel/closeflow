CREATE TABLE IF NOT EXISTS teams (workspace_id text NOT NULL, id text NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '', created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (workspace_id, id));
CREATE INDEX IF NOT EXISTS teams_workspace_idx ON teams(workspace_id);
CREATE TABLE IF NOT EXISTS team_members (workspace_id text NOT NULL, team_id text NOT NULL, user_id text NOT NULL, team_role text NOT NULL DEFAULT 'member', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (workspace_id, team_id, user_id));
CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members(workspace_id, user_id);
CREATE TABLE IF NOT EXISTS team_invites (workspace_id text NOT NULL, id text NOT NULL, team_id text NOT NULL DEFAULT '', email text NOT NULL, access_role text NOT NULL DEFAULT 'editor', team_role text NOT NULL DEFAULT 'member', token text NOT NULL, status text NOT NULL DEFAULT 'pending', invited_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, accepted_at timestamptz, PRIMARY KEY (workspace_id, id));
CREATE UNIQUE INDEX IF NOT EXISTS team_invites_token_unique ON team_invites(token);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id text NOT NULL DEFAULT '';
