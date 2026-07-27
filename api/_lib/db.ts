import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../../db/schema.js'

const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || ''

let sqlClient: ReturnType<typeof neon> | null = null
const createDatabase = () => drizzle(getSql(), { schema })
let database: ReturnType<typeof createDatabase> | null = null
let schemaReady: Promise<void> | null = null

export const isDatabaseConfigured = () => Boolean(databaseUrl())

export function getSql() {
  const url = databaseUrl()
  if (!url) throw new Error('DATABASE_NOT_CONFIGURED')
  if (!sqlClient) sqlClient = neon(url)
  return sqlClient
}

export function getDb() {
  if (!database) database = createDatabase()
  return database
}

async function createSchema() {
  const sql = getSql()
  await sql`CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, role text NOT NULL DEFAULT 'Project Coordinator', department text NOT NULL DEFAULT '', password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT ''`
  await sql`CREATE TABLE IF NOT EXISTS workspaces (id text PRIMARY KEY, name text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`
  await sql`CREATE TABLE IF NOT EXISTS workspace_members (workspace_id text NOT NULL, user_id text NOT NULL, access_role text NOT NULL DEFAULT 'owner', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (workspace_id, user_id))`
  await sql`CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id)`
  await sql`CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY, user_id text NOT NULL, workspace_id text NOT NULL DEFAULT '', token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT ''`
  await sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`
  await sql`CREATE TABLE IF NOT EXISTS teams (workspace_id text NOT NULL, id text NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '', created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (workspace_id, id))`
  await sql`CREATE INDEX IF NOT EXISTS teams_workspace_idx ON teams(workspace_id)`
  await sql`CREATE TABLE IF NOT EXISTS team_members (workspace_id text NOT NULL, team_id text NOT NULL, user_id text NOT NULL, team_role text NOT NULL DEFAULT 'member', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (workspace_id, team_id, user_id))`
  await sql`CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members(workspace_id, user_id)`
  await sql`CREATE TABLE IF NOT EXISTS team_invites (workspace_id text NOT NULL, id text NOT NULL, team_id text NOT NULL DEFAULT '', email text NOT NULL, access_role text NOT NULL DEFAULT 'editor', team_role text NOT NULL DEFAULT 'member', token text NOT NULL, status text NOT NULL DEFAULT 'pending', invited_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, accepted_at timestamptz, PRIMARY KEY (workspace_id, id))`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS team_invites_token_unique ON team_invites(token)`
  await sql`CREATE TABLE IF NOT EXISTS projects (workspace_id text NOT NULL, id text NOT NULL, name text NOT NULL, number text NOT NULL, team_id text NOT NULL DEFAULT '', department text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '', manager text NOT NULL DEFAULT '', vendor text NOT NULL DEFAULT '', budget double precision NOT NULL DEFAULT 0, committed double precision NOT NULL DEFAULT 0, target date NOT NULL, status text NOT NULL, next_action text NOT NULL DEFAULT '', owner text NOT NULL DEFAULT '', due date NOT NULL, updated timestamptz NOT NULL, PRIMARY KEY (workspace_id, id))`
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id text NOT NULL DEFAULT ''`
  await sql`CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects(workspace_id)`
  await sql`CREATE TABLE IF NOT EXISTS project_budget_lines (workspace_id text NOT NULL, id text NOT NULL, project_id text NOT NULL, category_code text NOT NULL, description text NOT NULL, vendor text NOT NULL DEFAULT '', reference text NOT NULL DEFAULT '', budget double precision NOT NULL DEFAULT 0, committed double precision NOT NULL DEFAULT 0, spent double precision NOT NULL DEFAULT 0, notes text NOT NULL DEFAULT '', PRIMARY KEY (workspace_id, id))`
  await sql`CREATE INDEX IF NOT EXISTS project_budget_lines_workspace_idx ON project_budget_lines(workspace_id)`
  await sql`CREATE INDEX IF NOT EXISTS project_budget_lines_project_idx ON project_budget_lines(workspace_id, project_id)`
  await sql`CREATE TABLE IF NOT EXISTS project_budget_category_funds (workspace_id text NOT NULL, project_id text NOT NULL, category_code text NOT NULL, funded double precision NOT NULL DEFAULT 0, PRIMARY KEY (workspace_id, project_id, category_code))`
  await sql`CREATE INDEX IF NOT EXISTS project_budget_category_funds_project_idx ON project_budget_category_funds(workspace_id, project_id)`
  await sql`CREATE TABLE IF NOT EXISTS project_vendors (workspace_id text NOT NULL, id text NOT NULL, project_id text NOT NULL, vendor text NOT NULL, po_number text NOT NULL DEFAULT '', po_amount double precision NOT NULL DEFAULT 0, po_date date, letter_status text NOT NULL DEFAULT 'Not Requested', letter_requested date, letter_received date, notes text NOT NULL DEFAULT '', PRIMARY KEY (workspace_id, id))`
  await sql`CREATE INDEX IF NOT EXISTS project_vendors_workspace_idx ON project_vendors(workspace_id)`
  await sql`CREATE INDEX IF NOT EXISTS project_vendors_project_idx ON project_vendors(workspace_id, project_id)`
  await sql`CREATE TABLE IF NOT EXISTS closeout_items (workspace_id text NOT NULL, id text NOT NULL, project_id text NOT NULL, title text NOT NULL, type text NOT NULL DEFAULT 'Other', responsible text NOT NULL DEFAULT '', owner text NOT NULL DEFAULT '', amount double precision NOT NULL DEFAULT 0, due date NOT NULL, priority text NOT NULL DEFAULT 'Medium', status text NOT NULL, notes text NOT NULL DEFAULT '', follow_up date, PRIMARY KEY (workspace_id, id))`
  await sql`CREATE INDEX IF NOT EXISTS closeout_items_workspace_idx ON closeout_items(workspace_id)`
  await sql`CREATE TABLE IF NOT EXISTS invoices (workspace_id text NOT NULL, id text NOT NULL, project_id text NOT NULL, vendor text NOT NULL DEFAULT '', number text NOT NULL DEFAULT 'Pending', amount double precision NOT NULL DEFAULT 0, po text NOT NULL DEFAULT '', due date NOT NULL, status text NOT NULL, disputed double precision NOT NULL DEFAULT 0, hold text NOT NULL DEFAULT '', PRIMARY KEY (workspace_id, id))`
  await sql`CREATE INDEX IF NOT EXISTS invoices_workspace_idx ON invoices(workspace_id)`
  await sql`CREATE TABLE IF NOT EXISTS activities (workspace_id text NOT NULL, id text NOT NULL, project_id text NOT NULL, action text NOT NULL, detail text NOT NULL DEFAULT '', occurred_at timestamptz NOT NULL, PRIMARY KEY (workspace_id, id))`
  await sql`CREATE INDEX IF NOT EXISTS activities_workspace_idx ON activities(workspace_id)`
  await sql`CREATE TABLE IF NOT EXISTS closeflow_meta (key text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
}

/**
 * Earlier builds shipped a sample workspace that the browser synced into Postgres.
 * Those records use fixed short ids; everything created in the app uses a UUID,
 * so deleting them by id cannot touch real work. This runs once per database.
 */
async function removeSampleData() {
  const sql = getSql()
  const marker = await sql`SELECT key FROM closeflow_meta WHERE key = 'sample_data_removed'`
  if (Array.isArray(marker) && marker.length > 0) return
  await sql`DELETE FROM activities WHERE project_id IN ('p1','p2','p3','p4','p5') OR id IN ('a1','a2','a3','a4')`
  await sql`DELETE FROM invoices WHERE project_id IN ('p1','p2','p3','p4','p5') OR id IN ('v1','v2','v3','v4')`
  await sql`DELETE FROM closeout_items WHERE project_id IN ('p1','p2','p3','p4','p5') OR id IN ('i1','i2','i3','i4','i5','i6','i7','i8')`
  await sql`DELETE FROM project_budget_category_funds WHERE project_id IN ('p1','p2','p3','p4','p5')`
  await sql`DELETE FROM project_budget_lines WHERE project_id IN ('p1','p2','p3','p4','p5')`
  await sql`DELETE FROM projects WHERE id IN ('p1','p2','p3','p4','p5')`
  await sql`INSERT INTO closeflow_meta (key) VALUES ('sample_data_removed') ON CONFLICT DO NOTHING`
}

export function ensureSchema() {
  if (!schemaReady) schemaReady = createSchema().then(removeSampleData).catch((error) => {
    schemaReady = null
    throw error
  })
  return schemaReady
}
