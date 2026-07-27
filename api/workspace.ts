import { randomUUID } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { activities, closeoutItems, invoices, projectBudgetCategoryFunds, projectBudgetLines, projects } from '../db/schema.js'
import { requireSession } from './_lib/auth.js'
import { ensureSchema, getDb, isDatabaseConfigured } from './_lib/db.js'

type StorePayload = {
  projects?: Record<string, unknown>[]
  items?: Record<string, unknown>[]
  invoices?: Record<string, unknown>[]
  activities?: Record<string, unknown>[]
  budgetLines?: Record<string, unknown>[]
  budgetCategoryFunds?: Record<string, unknown>[]
}

const bodyOf = (req: VercelRequest): StorePayload => typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const date = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : new Date().toISOString().slice(0, 10)
const timestamp = (value: unknown) => Number.isNaN(new Date(text(value)).getTime()) ? new Date().toISOString() : new Date(text(value)).toISOString()
const id = (value: unknown) => text(value) || randomUUID()
const categoryCode = (value: unknown) => ['0', '1', '2', '3', '4'].includes(text(value)) ? text(value) : '1'

const validateStore = (store: StorePayload) => {
  const groups = [store.projects, store.items, store.invoices, store.activities, store.budgetLines, store.budgetCategoryFunds]
  return groups.every((group) => group === undefined || (Array.isArray(group) && group.length <= 5000))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database is not configured.', code: 'DATABASE_NOT_CONFIGURED' })

  try {
    await ensureSchema()
    const session = await requireSession(req, res)
    if (!session) return
    const db = getDb()
    const workspaceId = session.workspaceId

    if (req.method === 'GET') {
      const [projectRows, itemRows, invoiceRows, activityRows, budgetRows, categoryFundRows] = await Promise.all([
        db.select().from(projects).where(eq(projects.workspaceId, workspaceId)),
        db.select().from(closeoutItems).where(eq(closeoutItems.workspaceId, workspaceId)),
        db.select().from(invoices).where(eq(invoices.workspaceId, workspaceId)),
        db.select().from(activities).where(eq(activities.workspaceId, workspaceId)),
        db.select().from(projectBudgetLines).where(eq(projectBudgetLines.workspaceId, workspaceId)),
        db.select().from(projectBudgetCategoryFunds).where(eq(projectBudgetCategoryFunds.workspaceId, workspaceId)),
      ])
      return res.status(200).json({
        projects: projectRows.map(({ workspaceId: _, ...row }) => row),
        items: itemRows.map(({ workspaceId: _, ...row }) => row),
        invoices: invoiceRows.map(({ workspaceId: _, ...row }) => row),
        activities: activityRows.map(({ workspaceId: _, occurredAt, ...row }) => ({ ...row, date: occurredAt })),
        budgetLines: budgetRows.map(({ workspaceId: _, ...row }) => row),
        budgetCategoryFunds: categoryFundRows.map(({ workspaceId: _, ...row }) => row),
      })
    }

    if (req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, PUT')
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const store = bodyOf(req)
    if (!validateStore(store)) return res.status(400).json({ error: 'Invalid workspace payload.' })

    await db.delete(activities).where(eq(activities.workspaceId, workspaceId))
    await db.delete(invoices).where(eq(invoices.workspaceId, workspaceId))
    await db.delete(closeoutItems).where(eq(closeoutItems.workspaceId, workspaceId))
    await db.delete(projectBudgetCategoryFunds).where(eq(projectBudgetCategoryFunds.workspaceId, workspaceId))
    await db.delete(projectBudgetLines).where(eq(projectBudgetLines.workspaceId, workspaceId))
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId))

    const projectValues = (store.projects || []).map((row) => ({
      workspaceId,
      id: id(row.id),
      name: text(row.name, 'Untitled project'),
      number: text(row.number, 'TBD'),
      teamId: text(row.teamId),
      department: text(row.department),
      location: text(row.location),
      manager: text(row.manager),
      vendor: text(row.vendor),
      budget: number(row.budget),
      committed: number(row.committed),
      target: date(row.target),
      status: text(row.status, 'Needs Attention'),
      nextAction: text(row.nextAction),
      owner: text(row.owner),
      due: date(row.due),
      updated: timestamp(row.updated),
    }))
    const budgetValues = (store.budgetLines || []).map((row) => ({
      workspaceId,
      id: id(row.id),
      projectId: text(row.projectId),
      categoryCode: categoryCode(row.categoryCode),
      description: text(row.description, 'Untitled budget line'),
      vendor: text(row.vendor),
      reference: text(row.reference),
      budget: number(row.budget),
      committed: number(row.committed),
      spent: number(row.spent),
      notes: text(row.notes),
    }))
    const categoryFundValues = (store.budgetCategoryFunds || []).map((row) => ({
      workspaceId,
      projectId: text(row.projectId),
      categoryCode: categoryCode(row.categoryCode),
      funded: Math.max(0, number(row.funded)),
    }))
    const itemValues = (store.items || []).map((row) => ({
      workspaceId,
      id: id(row.id),
      projectId: text(row.projectId),
      title: text(row.title, 'Untitled item'),
      type: text(row.type, 'Other'),
      responsible: text(row.responsible),
      owner: text(row.owner),
      amount: number(row.amount),
      due: date(row.due),
      priority: text(row.priority, 'Medium'),
      status: text(row.status, 'Not Started'),
      notes: text(row.notes),
      followUp: text(row.followUp) ? date(row.followUp) : null,
    }))
    const invoiceValues = (store.invoices || []).map((row) => ({
      workspaceId,
      id: id(row.id),
      projectId: text(row.projectId),
      vendor: text(row.vendor),
      number: text(row.number, 'Pending'),
      amount: number(row.amount),
      po: text(row.po),
      due: date(row.due),
      status: text(row.status, 'Requested'),
      disputed: number(row.disputed),
      hold: text(row.hold),
    }))
    const activityValues = (store.activities || []).map((row) => ({
      workspaceId,
      id: id(row.id),
      projectId: text(row.projectId),
      action: text(row.action, 'Activity'),
      detail: text(row.detail),
      occurredAt: timestamp(row.date),
    }))

    if (projectValues.length) await db.insert(projects).values(projectValues)
    if (budgetValues.length) await db.insert(projectBudgetLines).values(budgetValues)
    if (categoryFundValues.length) await db.insert(projectBudgetCategoryFunds).values(categoryFundValues)
    if (itemValues.length) await db.insert(closeoutItems).values(itemValues)
    if (invoiceValues.length) await db.insert(invoices).values(invoiceValues)
    if (activityValues.length) await db.insert(activities).values(activityValues)

    return res.status(200).json({ ok: true, savedAt: new Date().toISOString() })
  } catch (error) {
    console.error('[api/workspace] failed', error)
    return res.status(500).json({ error: 'Workspace data could not be saved.', code: 'WORKSPACE_FAILED' })
  }
}
