import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sessions, users, workspaceMembers, workspaces } from '../../db/schema.js'
import { getDb } from './db.js'

export const SESSION_COOKIE = 'closeflow_session'

export type WorkspaceSummary = {
  id: string
  name: string
  accessRole: string
}

export type SessionUser = {
  id: string
  name: string
  email: string
  role: string
  department: string
  /** The workspace the session is currently working in. */
  workspaceId: string
  workspaceName: string
  accessRole: string
  /** Every workspace this account belongs to, so the app can offer a switcher. */
  workspaces: WorkspaceSummary[]
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()
export const newId = () => randomUUID()
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const digest = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${digest}`
}

export function verifyPassword(password: string, stored: string) {
  const [salt, digest] = stored.split(':')
  if (!salt || !digest) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(digest, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

function parseCookies(header: string | undefined) {
  return Object.fromEntries((header || '').split(';').map((part) => {
    const [key, ...value] = part.trim().split('=')
    return [key, decodeURIComponent(value.join('='))]
  }).filter(([key]) => key))
}

function cookieValue(token: string, remember: boolean) {
  const secure = process.env.VERCEL ? '; Secure' : ''
  const maxAge = remember ? '; Max-Age=2592000' : ''
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}${maxAge}`
}

export function clearSessionCookie(res: VercelResponse) {
  const secure = process.env.VERCEL ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`)
}

/** Names the workspace a new account starts out owning. */
export function personalWorkspaceName(name: string) {
  const first = name.trim().split(/\s+/)[0] || 'My'
  return `${first}${first.toLowerCase().endsWith('s') ? "'" : "'s"} workspace`
}

/** Creates a workspace owned by the given account. */
export async function createWorkspaceFor(userId: string, name: string) {
  const db = getDb()
  const workspaceId = newId()
  await db.insert(workspaces).values({ id: workspaceId, name, createdBy: userId })
  await db.insert(workspaceMembers).values({ workspaceId, userId, accessRole: 'owner' }).onConflictDoNothing()
  return workspaceId
}

/** Every workspace the account belongs to, oldest membership first. */
export async function listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const rows = await getDb()
    .select({ id: workspaces.id, name: workspaces.name, accessRole: workspaceMembers.accessRole, joinedAt: workspaceMembers.createdAt })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
  return rows
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map((row) => ({ id: row.id, name: row.name, accessRole: row.accessRole }))
}

/**
 * Guarantees the account can actually get into the app.
 *
 * An account with no workspace membership row cannot resolve a session at all, so it can sign in
 * with the right password and still be told it is not authenticated. That happens to accounts
 * created before workspaces existed and to signups that failed partway through, and the account
 * can never recover on its own. Reattach the workspaces the account created, and otherwise give
 * it the personal workspace every account is supposed to have.
 */
export async function ensureWorkspaceAccess(userId: string, name: string): Promise<WorkspaceSummary[]> {
  const existing = await listWorkspaces(userId)
  if (existing.length) return existing

  const db = getDb()
  const owned = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.createdBy, userId))
  if (owned.length) {
    for (const workspace of owned) {
      await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, accessRole: 'owner' }).onConflictDoNothing()
    }
  } else {
    await createWorkspaceFor(userId, personalWorkspaceName(name))
  }
  return listWorkspaces(userId)
}

export async function createSession(userId: string, remember: boolean, res: VercelResponse, workspaceId = '') {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000).toISOString()
  await getDb().insert(sessions).values({
    id: newId(),
    userId,
    workspaceId,
    tokenHash: hashToken(token),
    expiresAt,
  })
  res.setHeader('Set-Cookie', cookieValue(token, remember))
}

export async function destroySession(req: VercelRequest, res: VercelResponse) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  clearSessionCookie(res)
}

async function readSession(req: VercelRequest) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (!token) return null
  const rows = await getDb()
    .select({
      sessionId: sessions.id,
      activeWorkspaceId: sessions.workspaceId,
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      department: users.department,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date().toISOString())))
    .limit(1)
  return rows[0] || null
}

export async function getSessionUser(req: VercelRequest): Promise<SessionUser | null> {
  const row = await readSession(req)
  if (!row) return null

  const { sessionId, activeWorkspaceId, ...user } = row
  const memberships = await ensureWorkspaceAccess(user.id, user.name)
  // An account always has at least one workspace by this point, so this cannot leave the app empty.
  const active = memberships.find((workspace) => workspace.id === activeWorkspaceId) || memberships[0]
  if (!active) return null
  if (active.id !== activeWorkspaceId) {
    await getDb().update(sessions).set({ workspaceId: active.id }).where(eq(sessions.id, sessionId))
  }

  return {
    ...user,
    workspaceId: active.id,
    workspaceName: active.name,
    accessRole: active.accessRole,
    workspaces: memberships,
  }
}

/** Points the current browser session at another workspace the account belongs to. */
export async function setActiveWorkspace(req: VercelRequest, workspaceId: string) {
  const row = await readSession(req)
  if (!row) return false
  const memberships = await listWorkspaces(row.id)
  if (!memberships.some((workspace) => workspace.id === workspaceId)) return false
  await getDb().update(sessions).set({ workspaceId }).where(eq(sessions.id, row.sessionId))
  return true
}

export async function requireSession(req: VercelRequest, res: VercelResponse) {
  const user = await getSessionUser(req)
  if (!user) {
    res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' })
    return null
  }
  return user
}
