import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sessions, users, workspaceMembers, workspaces } from '../../db/schema.js'
import { getDb } from './db.js'

export const SESSION_COOKIE = 'closeflow_session'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: string
  workspaceId: string
  workspaceName: string
  accessRole: string
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

export async function createSession(userId: string, remember: boolean, res: VercelResponse) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000).toISOString()
  await getDb().insert(sessions).values({
    id: newId(),
    userId,
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

export async function getSessionUser(req: VercelRequest): Promise<SessionUser | null> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (!token) return null
  const now = new Date().toISOString()
  const rows = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      accessRole: workspaceMembers.accessRole,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1)
  return rows[0] || null
}

export async function requireSession(req: VercelRequest, res: VercelResponse) {
  const user = await getSessionUser(req)
  if (!user) {
    res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' })
    return null
  }
  return user
}
