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
  await sql`CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, role text NOT NULL DEFAULT 'Project Coordinator', password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`
  await sql`CREATE TABLE IF NOT EXISTS workspaces (id text PRIMARY KEY, name text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`
  await sql`CREATE TABLE IF NOT EXISTS workspace_members (workspace_id text NOT NULL, user_id text NOT NULL, access_role text NOT NULL DEFAULT 'owner', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (workspace_id, user_id))`
  await sql`CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY, user_id text NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`
  await sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`
  await sql`CREATE TABLE IF NOT EXISTS projects (workspace_id text NOT NULL, id text NOT NULL, name text NOT NULL, number text NOT NULL, department text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '', manager text NOT NULL DEFAULT '', vendor text NOT NULL DEFAULT '', budget double precision NOT NULL DEFAULT 0, committed double precision NOT NULL DEFAULT 0, target date NOT NULL, status text NOT NULL, next_action text NOT NULL DEFAULT '', owner text NOT NULL DEFAULT '', due date NOT NULL, updated timestamptz NOT NULL, PRIMARY KEY (workspace_id, id))`
  await sql`CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects(workspace_id)`
  await sql`CREATE TABLE IF NOT EXISTS closeout_items (workspace_id text NOT NULL, id text NOT NULL, project_id text NOT NULL, title text NOT NULL, type text NOT NULL DEFAULT 'Other', responsible text NOT NULL DEFAULT '', owner text NOT NULL DEFAULT '', amount double precision NOT NULL DEFAULT 0, due date NOT NULL, priority text NOT NULL DEFAULT 'Medium', status text NOT NULL, notes text NOT NULL DEFAULT '', follow_up date, PRIMARY KEY (workspace_id, id))`
  await sql`CREATE INDEX IF NOT EXISTS closeout_items_workspace_idx ON closeout_items(workspace_id)`
  await sql`CREATE TABLE IF NOT EXISTS invoices (workspace_id text NOT NULL, id text NOT NULL, project_id text NOT NULL, vendor text NOT NULL DEFAULT '', number text NOT NULL DEFAULT 'Pending', amount double precision NOT NULL DEFAULT 0, po text NOT NULL DEFAULT '', due date NOT NULL, status text NOT NULL, disputed double precision NOT NULL DEFAULT 0, hold text NOT NULL DEFAULT '', PRIMARY KEY (workspace_id, id))`
  await sql`CREATE INDEX IF NOT EXISTS invoices_workspace_idx ON invoices(workspace_id)`
  await sql`CREATE TABLE IF NOT EXISTS activities (workspace_id text NOT NULL, id text NOT NULL, project_id text NOT NULL, action text NOT NULL, detail text NOT NULL DEFAULT '', occurred_at timestamptz NOT NULL, PRIMARY KEY (workspace_id, id))`
  await sql`CREATE INDEX IF NOT EXISTS activities_workspace_idx ON activities(workspace_id)`
}

export function ensureSchema() {
  if (!schemaReady) schemaReady = createSchema().catch((error) => {
    schemaReady = null
    throw error
  })
  return schemaReady
}
