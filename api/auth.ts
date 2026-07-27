import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, count, eq } from 'drizzle-orm'
import { teamInvites, teamMembers, teams, users, workspaces, workspaceMembers } from '../db/schema.js'
import {
  createSession,
  createWorkspaceFor,
  destroySession,
  ensureWorkspaceAccess,
  getSessionUser,
  hashPassword,
  newId,
  normalizeEmail,
  personalWorkspaceName,
  setActiveWorkspace,
  verifyPassword,
} from './_lib/auth.js'
import { ensureSchema, getDb, isDatabaseConfigured } from './_lib/db.js'

const bodyOf = (req: VercelRequest) => typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})

/** Resolves an invitation token that is still pending and unexpired. */
async function findInvite(token: string) {
  if (!token) return null
  const [invite] = await getDb().select().from(teamInvites).where(and(eq(teamInvites.token, token), eq(teamInvites.status, 'pending'))).limit(1)
  if (!invite || new Date(invite.expiresAt).getTime() < Date.now()) return null
  return invite
}

/** Adds an account to the workspace and team an invitation was written for, then closes the invitation. */
async function redeemInvite(invite: Awaited<ReturnType<typeof findInvite>>, userId: string) {
  if (!invite) return
  const db = getDb()
  await db.insert(workspaceMembers).values({ workspaceId: invite.workspaceId, userId, accessRole: invite.accessRole }).onConflictDoNothing()
  if (invite.teamId) {
    await db.insert(teamMembers).values({ workspaceId: invite.workspaceId, teamId: invite.teamId, userId, teamRole: invite.teamRole }).onConflictDoNothing()
  }
  await db.update(teamInvites).set({ status: 'accepted', acceptedAt: new Date().toISOString() })
    .where(and(eq(teamInvites.workspaceId, invite.workspaceId), eq(teamInvites.id, invite.id)))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isDatabaseConfigured()) {
    return res.status(503).json({
      error: 'Neon is not connected to this Vercel project.',
      code: 'DATABASE_NOT_CONFIGURED',
    })
  }

  try {
    await ensureSchema()
    const db = getDb()

    if (req.method === 'GET') {
      const user = await getSessionUser(req)
      const [{ value: userCount }] = await db.select({ value: count() }).from(users)
      return res.status(200).json({
        authenticated: Boolean(user),
        // Kept so a brand new deployment opens straight onto the account form.
        setupRequired: Number(userCount) === 0,
        user,
      })
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const body = bodyOf(req)
    if (body.action === 'logout') {
      await destroySession(req, res)
      return res.status(200).json({ ok: true })
    }

    if (body.action === 'signup') {
      const name = String(body.name || '').trim()
      const email = normalizeEmail(String(body.email || ''))
      const role = String(body.role || 'Project Coordinator').trim() || 'Project Coordinator'
      const password = String(body.password || '')
      const remember = Boolean(body.remember)
      if (!name || !email.includes('@') || password.length < 8) {
        return res.status(400).json({ error: 'Enter a name, valid email, and password of at least 8 characters.' })
      }

      const taken = (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0]
      if (taken) {
        return res.status(409).json({ error: 'An account already exists for this email address. Sign in instead.', code: 'EMAIL_TAKEN' })
      }

      // An invitation link may be open in the tab. Honour it when it was written for this address.
      const invite = await findInvite(String(body.token || ''))
      const invited = invite && invite.email === email ? invite : null

      const userId = newId()
      await db.insert(users).values({ id: userId, email, name, role, passwordHash: hashPassword(password) })
      // Every account owns a workspace of its own, and can be invited into any number of others.
      const personalWorkspaceId = await createWorkspaceFor(userId, personalWorkspaceName(name))
      await redeemInvite(invited, userId)

      await createSession(userId, remember, res, invited ? invited.workspaceId : personalWorkspaceId)
      return res.status(201).json({ ok: true })
    }

    if (body.action === 'login') {
      const email = normalizeEmail(String(body.email || ''))
      const password = String(body.password || '')
      const remember = Boolean(body.remember)
      const row = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0]
      if (!row || !verifyPassword(password, row.passwordHash)) {
        return res.status(401).json({ error: 'The email or password is incorrect.' })
      }
      // Repairs accounts that lost their workspace membership and could never sign in again.
      const memberships = await ensureWorkspaceAccess(row.id, row.name)
      await createSession(row.id, remember, res, memberships[0]?.id || '')
      return res.status(200).json({ ok: true })
    }

    if (body.action === 'inviteInfo') {
      const invite = await findInvite(String(body.token || ''))
      if (!invite) return res.status(404).json({ error: 'This invitation is no longer valid.', code: 'INVITE_INVALID' })
      const [workspace] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, invite.workspaceId)).limit(1)
      const [team] = invite.teamId
        ? await db.select({ name: teams.name }).from(teams).where(and(eq(teams.workspaceId, invite.workspaceId), eq(teams.id, invite.teamId))).limit(1)
        : [undefined]
      const [invitedBy] = await db.select({ name: users.name }).from(users).where(eq(users.id, invite.invitedBy)).limit(1)
      const existing = (await db.select({ id: users.id }).from(users).where(eq(users.email, invite.email)).limit(1))[0]
      return res.status(200).json({
        email: invite.email,
        accessRole: invite.accessRole,
        workspaceName: workspace?.name || 'CloseFlow',
        teamName: team?.name || '',
        invitedBy: invitedBy?.name || '',
        // The invitee may already have their own CloseFlow account, in which case they sign in and join.
        hasAccount: Boolean(existing),
      })
    }

    if (body.action === 'acceptInvite') {
      const invite = await findInvite(String(body.token || ''))
      if (!invite) return res.status(404).json({ error: 'This invitation is no longer valid.', code: 'INVITE_INVALID' })

      const name = String(body.name || '').trim()
      const role = String(body.role || 'Project Coordinator').trim() || 'Project Coordinator'
      const password = String(body.password || '')
      const remember = Boolean(body.remember)
      if (!name || password.length < 8) return res.status(400).json({ error: 'Enter your name and a password of at least 8 characters.' })

      const existing = (await db.select({ id: users.id }).from(users).where(eq(users.email, invite.email)).limit(1))[0]
      if (existing) {
        return res.status(409).json({
          error: 'An account already exists for this email address. Sign in and the invitation will be applied.',
          code: 'EMAIL_TAKEN',
        })
      }

      const userId = newId()
      await db.insert(users).values({ id: userId, email: invite.email, name, role, passwordHash: hashPassword(password) })
      await createWorkspaceFor(userId, personalWorkspaceName(name))
      await redeemInvite(invite, userId)
      await createSession(userId, remember, res, invite.workspaceId)
      return res.status(201).json({ ok: true })
    }

    if (body.action === 'joinInvite') {
      const session = await getSessionUser(req)
      if (!session) return res.status(401).json({ error: 'Sign in to accept this invitation.', code: 'UNAUTHENTICATED' })
      const invite = await findInvite(String(body.token || ''))
      if (!invite) return res.status(404).json({ error: 'This invitation is no longer valid.', code: 'INVITE_INVALID' })
      if (invite.email !== normalizeEmail(session.email)) {
        return res.status(403).json({ error: `This invitation was sent to ${invite.email}. Sign in with that account to accept it.` })
      }
      await redeemInvite(invite, session.id)
      await setActiveWorkspace(req, invite.workspaceId)
      return res.status(200).json({ ok: true })
    }

    if (body.action === 'switchWorkspace') {
      const session = await getSessionUser(req)
      if (!session) return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' })
      const moved = await setActiveWorkspace(req, String(body.workspaceId || ''))
      if (!moved) return res.status(403).json({ error: 'You are not a member of that workspace.' })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown authentication action.' })
  } catch (error) {
    console.error('[api/auth] failed', error)
    return res.status(500).json({ error: 'Authentication service failed.', code: 'AUTH_FAILED' })
  }
}
