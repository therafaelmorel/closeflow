import {
  date,
  doublePrecision,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('Project Coordinator'),
  department: text('department').notNull().default(''),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [uniqueIndex('users_email_unique').on(table.email)])

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  accessRole: text('access_role').notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })])

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [uniqueIndex('sessions_token_hash_unique').on(table.tokenHash)])

export const closeflowMeta = pgTable('closeflow_meta', {
  key: text('key').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

export const teams = pgTable('teams', {
  workspaceId: text('workspace_id').notNull(),
  id: text('id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.id] })])

export const teamMembers = pgTable('team_members', {
  workspaceId: text('workspace_id').notNull(),
  teamId: text('team_id').notNull(),
  userId: text('user_id').notNull(),
  teamRole: text('team_role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.teamId, table.userId] })])

export const teamInvites = pgTable('team_invites', {
  workspaceId: text('workspace_id').notNull(),
  id: text('id').notNull(),
  teamId: text('team_id').notNull().default(''),
  email: text('email').notNull(),
  accessRole: text('access_role').notNull().default('editor'),
  teamRole: text('team_role').notNull().default('member'),
  token: text('token').notNull(),
  status: text('status').notNull().default('pending'),
  invitedBy: text('invited_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'string' }),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.id] }), uniqueIndex('team_invites_token_unique').on(table.token)])

export const projects = pgTable('projects', {
  workspaceId: text('workspace_id').notNull(),
  id: text('id').notNull(),
  name: text('name').notNull(),
  number: text('number').notNull(),
  teamId: text('team_id').notNull().default(''),
  department: text('department').notNull().default(''),
  location: text('location').notNull().default(''),
  manager: text('manager').notNull().default(''),
  vendor: text('vendor').notNull().default(''),
  budget: doublePrecision('budget').notNull().default(0),
  committed: doublePrecision('committed').notNull().default(0),
  target: date('target', { mode: 'string' }).notNull(),
  status: text('status').notNull(),
  nextAction: text('next_action').notNull().default(''),
  owner: text('owner').notNull().default(''),
  due: date('due', { mode: 'string' }).notNull(),
  updated: timestamp('updated', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.id] })])

export const projectBudgetLines = pgTable('project_budget_lines', {
  workspaceId: text('workspace_id').notNull(),
  id: text('id').notNull(),
  projectId: text('project_id').notNull(),
  categoryCode: text('category_code').notNull(),
  description: text('description').notNull(),
  vendor: text('vendor').notNull().default(''),
  reference: text('reference').notNull().default(''),
  budget: doublePrecision('budget').notNull().default(0),
  committed: doublePrecision('committed').notNull().default(0),
  spent: doublePrecision('spent').notNull().default(0),
  notes: text('notes').notNull().default(''),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.id] })])

export const projectBudgetCategoryFunds = pgTable('project_budget_category_funds', {
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id').notNull(),
  categoryCode: text('category_code').notNull(),
  funded: doublePrecision('funded').notNull().default(0),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.projectId, table.categoryCode] })])

export const closeoutItems = pgTable('closeout_items', {
  workspaceId: text('workspace_id').notNull(),
  id: text('id').notNull(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  type: text('type').notNull().default('Other'),
  responsible: text('responsible').notNull().default(''),
  owner: text('owner').notNull().default(''),
  amount: doublePrecision('amount').notNull().default(0),
  due: date('due', { mode: 'string' }).notNull(),
  priority: text('priority').notNull().default('Medium'),
  status: text('status').notNull(),
  notes: text('notes').notNull().default(''),
  followUp: date('follow_up', { mode: 'string' }),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.id] })])

export const invoices = pgTable('invoices', {
  workspaceId: text('workspace_id').notNull(),
  id: text('id').notNull(),
  projectId: text('project_id').notNull(),
  vendor: text('vendor').notNull().default(''),
  number: text('number').notNull().default('Pending'),
  amount: doublePrecision('amount').notNull().default(0),
  po: text('po').notNull().default(''),
  due: date('due', { mode: 'string' }).notNull(),
  status: text('status').notNull(),
  disputed: doublePrecision('disputed').notNull().default(0),
  hold: text('hold').notNull().default(''),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.id] })])

export const activities = pgTable('activities', {
  workspaceId: text('workspace_id').notNull(),
  id: text('id').notNull(),
  projectId: text('project_id').notNull(),
  action: text('action').notNull(),
  detail: text('detail').notNull().default(''),
  occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.id] })])
