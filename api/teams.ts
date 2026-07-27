import { randomBytes } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { teamInvites, teamMembers, teams, users, workspaceMembers } from '../db/schema.js'
import { newId, normalizeEmail, requireSession, type SessionUser } from './_lib/auth.js'
import { ensureSchema, getDb, isDatabaseConfigured } from './_lib/db.js'

const INVITE_DAYS = 14
const bodyOf = (req: VercelRequest) => typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
const accessRoles = ['manager', 'editor', 'viewer']
const teamRoles = ['lead', 'member']
const newInviteToken = () => randomBytes(24).toString('base64url')

/** Owners and managers administer every team; a team lead administers only their own team. */
async function canManageTeam(session: SessionUser, teamId: string) {
  if (session.accessRole === 'owner' || session.accessRole === 'manager') return true
  if (!teamId) return false
  const rows = await getDb().select({ teamRole: teamMembers.teamRole }).from(teamMembers)
    .where(and(eq(teamMembers.workspaceId, session.workspaceId), eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.id)))
    .limit(1)
  return rows[0]?.teamRole === 'lead'
}

async function readTeams(session: SessionUser) {
  const db = getDb()
  const workspaceId = session.workspaceId
  const [teamRows, memberRows, inviteRows, peopleRows] = await Promise.all([
    db.select().from(teams).where(eq(teams.workspaceId, workspaceId)),
    db.select({ teamId: teamMembers.teamId, userId: teamMembers.userId, teamRole: teamMembers.teamRole, name: users.name, email: users.email, role: users.role, accessRole: workspaceMembers.accessRole })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, teamMembers.workspaceId), eq(workspaceMembers.userId, teamMembers.userId)))
      .where(eq(teamMembers.workspaceId, workspaceId)),
    db.select().from(teamInvites).where(and(eq(teamInvites.workspaceId, workspaceId), eq(teamInvites.status, 'pending'))),
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role, accessRole: workspaceMembers.accessRole })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId)),
  ])

  const administrator = session.accessRole === 'owner' || session.accessRole === 'manager'
  const list = teamRows
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      createdAt: team.createdAt,
      manageable: administrator || memberRows.some((member) => member.teamId === team.id && member.userId === session.id && member.teamRole === 'lead'),
      members: memberRows.filter((member) => member.teamId === team.id).sort((a, b) => a.name.localeCompare(b.name)),
      invites: inviteRows.filter((invite) => invite.teamId === team.id).map((invite) => ({ id: invite.id, email: invite.email, accessRole: invite.accessRole, teamRole: invite.teamRole, token: invite.token, expiresAt: invite.expiresAt })),
    }))

  return {
    teams: list,
    people: peopleRows.sort((a, b) => a.name.localeCompare(b.name)),
    workspaceInvites: inviteRows.filter((invite) => !invite.teamId).map((invite) => ({ id: invite.id, email: invite.email, accessRole: invite.accessRole, token: invite.token, expiresAt: invite.expiresAt })),
    canCreateTeams: session.accessRole === 'owner' || session.accessRole === 'manager',
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database is not configured.', code: 'DATABASE_NOT_CONFIGURED' })

  try {
    await ensureSchema()
    const session = await requireSession(req, res)
    if (!session) return
    const db = getDb()
    const workspaceId = session.workspaceId

    if (req.method === 'GET') return res.status(200).json(await readTeams(session))

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const body = bodyOf(req)
    const teamId = String(body.teamId || '')

    if (body.action === 'createTeam') {
      if (session.accessRole !== 'owner' && session.accessRole !== 'manager') return res.status(403).json({ error: 'Only owners and managers can create teams.' })
      const name = String(body.name || '').trim()
      if (!name) return res.status(400).json({ error: 'Enter a team name.' })
      const id = newId()
      await db.insert(teams).values({ workspaceId, id, name, description: String(body.description || '').trim(), createdBy: session.id })
      await db.insert(teamMembers).values({ workspaceId, teamId: id, userId: session.id, teamRole: 'lead' })
      return res.status(201).json(await readTeams(session))
    }

    if (body.action === 'updateTeam') {
      if (!await canManageTeam(session, teamId)) return res.status(403).json({ error: 'You cannot manage this team.' })
      const name = String(body.name || '').trim()
      if (!name) return res.status(400).json({ error: 'Enter a team name.' })
      await db.update(teams).set({ name, description: String(body.description || '').trim() }).where(and(eq(teams.workspaceId, workspaceId), eq(teams.id, teamId)))
      return res.status(200).json(await readTeams(session))
    }

    if (body.action === 'deleteTeam') {
      if (session.accessRole !== 'owner' && session.accessRole !== 'manager') return res.status(403).json({ error: 'Only owners and managers can delete teams.' })
      await db.delete(teamMembers).where(and(eq(teamMembers.workspaceId, workspaceId), eq(teamMembers.teamId, teamId)))
      await db.delete(teamInvites).where(and(eq(teamInvites.workspaceId, workspaceId), eq(teamInvites.teamId, teamId)))
      await db.delete(teams).where(and(eq(teams.workspaceId, workspaceId), eq(teams.id, teamId)))
      return res.status(200).json(await readTeams(session))
    }

    if (body.action === 'invite') {
      if (!await canManageTeam(session, teamId)) return res.status(403).json({ error: 'You cannot invite people to this team.' })
      const email = normalizeEmail(String(body.email || ''))
      if (!email.includes('@')) return res.status(400).json({ error: 'Enter a valid email address.' })
      const accessRole = accessRoles.includes(String(body.accessRole)) ? String(body.accessRole) : 'editor'
      const teamRole = teamRoles.includes(String(body.teamRole)) ? String(body.teamRole) : 'member'
      // A team lead can staff their own team but cannot hand out workspace-wide manager access.
      if (accessRole === 'manager' && session.accessRole !== 'owner' && session.accessRole !== 'manager') {
        return res.status(403).json({ error: 'Only owners and managers can invite a manager.' })
      }

      const existing = (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0]
      if (existing) {
        const member = (await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, existing.id))).limit(1))[0]
        // Someone already in this workspace joins the team straight away. Anyone else has their own
        // account elsewhere, so they get an invitation to accept from it rather than a rejection.
        if (member) {
          if (!teamId) return res.status(409).json({ error: 'That person is already in this workspace.' })
          await db.insert(teamMembers).values({ workspaceId, teamId, userId: existing.id, teamRole }).onConflictDoNothing()
          return res.status(200).json({ ...await readTeams(session), added: true })
        }
      }

      const pending = (await db.select({ id: teamInvites.id }).from(teamInvites)
        .where(and(eq(teamInvites.workspaceId, workspaceId), eq(teamInvites.email, email), eq(teamInvites.teamId, teamId), eq(teamInvites.status, 'pending'))).limit(1))[0]
      if (pending) return res.status(409).json({ error: 'That email already has a pending invitation.' })

      await db.insert(teamInvites).values({
        workspaceId,
        id: newId(),
        teamId,
        email,
        accessRole,
        teamRole,
        token: newInviteToken(),
        invitedBy: session.id,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      })
      return res.status(201).json(await readTeams(session))
    }

    if (body.action === 'revokeInvite') {
      const invite = (await db.select().from(teamInvites).where(and(eq(teamInvites.workspaceId, workspaceId), eq(teamInvites.id, String(body.inviteId || '')))).limit(1))[0]
      if (!invite) return res.status(404).json({ error: 'That invitation no longer exists.' })
      if (!await canManageTeam(session, invite.teamId)) return res.status(403).json({ error: 'You cannot manage this invitation.' })
      await db.delete(teamInvites).where(and(eq(teamInvites.workspaceId, workspaceId), eq(teamInvites.id, invite.id)))
      return res.status(200).json(await readTeams(session))
    }

    if (body.action === 'addMember' || body.action === 'setTeamRole') {
      if (!await canManageTeam(session, teamId)) return res.status(403).json({ error: 'You cannot manage this team.' })
      const userId = String(body.userId || '')
      const teamRole = teamRoles.includes(String(body.teamRole)) ? String(body.teamRole) : 'member'
      const member = (await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1))[0]
      if (!member) return res.status(404).json({ error: 'That person is not part of this workspace.' })
      if (body.action === 'addMember') await db.insert(teamMembers).values({ workspaceId, teamId, userId, teamRole }).onConflictDoNothing()
      else await db.update(teamMembers).set({ teamRole }).where(and(eq(teamMembers.workspaceId, workspaceId), eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      return res.status(200).json(await readTeams(session))
    }

    if (body.action === 'removeMember') {
      if (!await canManageTeam(session, teamId)) return res.status(403).json({ error: 'You cannot manage this team.' })
      await db.delete(teamMembers).where(and(eq(teamMembers.workspaceId, workspaceId), eq(teamMembers.teamId, teamId), eq(teamMembers.userId, String(body.userId || ''))))
      return res.status(200).json(await readTeams(session))
    }

    return res.status(400).json({ error: 'Unknown teams action.' })
  } catch (error) {
    console.error('[api/teams] failed', error)
    return res.status(500).json({ error: 'The teams service failed.', code: 'TEAMS_FAILED' })
  }
}
