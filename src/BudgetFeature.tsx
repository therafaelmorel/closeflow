import { createRoot, type Root } from 'react-dom/client'
import BudgetSheet, { type BudgetCategoryFunding, type BudgetLine } from './BudgetSheet'

type Project = { id: string; name: string; number: string; budget: number; committed: number; [key: string]: unknown }
type WorkspaceStore = {
  projects: Project[]
  items: unknown[]
  invoices: unknown[]
  activities: unknown[]
  budgetLines?: BudgetLine[]
  budgetCategoryFunds?: BudgetCategoryFunding[]
}

const DATA_KEY = 'closeflow-v1'
const roots = new Map<HTMLElement, Root>()
let activeProjectId = ''
let activeSnapshot = ''

const readWorkspace = (): WorkspaceStore | null => {
  try {
    const value = JSON.parse(localStorage.getItem(DATA_KEY) || 'null')
    return value && Array.isArray(value.projects) ? value as WorkspaceStore : null
  } catch {
    return null
  }
}

const writeWorkspace = (workspace: WorkspaceStore) => {
  localStorage.setItem(DATA_KEY, JSON.stringify(workspace))
}

const updateCommittedTotal = (workspace: WorkspaceStore, projectId: string) => {
  const projectLines = (workspace.budgetLines || []).filter(item => item.projectId === projectId)
  const committed = projectLines.reduce((total, item) => total + Number(item.committed || 0), 0)
  workspace.projects = workspace.projects.map(item => item.id === projectId ? { ...item, committed, updated: new Date().toISOString() } : item)
}

function BudgetProjectMount({ projectId }: { projectId: string }) {
  const workspace = readWorkspace()
  const project = workspace?.projects.find(item => item.id === projectId)
  if (!workspace || !project) return null
  const lines = (workspace.budgetLines || []).filter(line => line.projectId === projectId)
  const categoryFunds = (workspace.budgetCategoryFunds || []).filter(item => item.projectId === projectId)

  const saveLine = (line: BudgetLine) => {
    const current = readWorkspace()
    if (!current) return
    const budgetLines = current.budgetLines || []
    const exists = budgetLines.some(item => item.id === line.id)
    current.budgetLines = exists ? budgetLines.map(item => item.id === line.id ? line : item) : [...budgetLines, line]
    updateCommittedTotal(current, projectId)
    writeWorkspace(current)
    renderBudgetFeature(true)
  }

  const deleteLine = (id: string) => {
    const current = readWorkspace()
    if (!current) return
    current.budgetLines = (current.budgetLines || []).filter(item => item.id !== id)
    updateCommittedTotal(current, projectId)
    writeWorkspace(current)
    renderBudgetFeature(true)
  }

  const saveCategoryFunding = (funding: BudgetCategoryFunding) => {
    const current = readWorkspace()
    if (!current) return
    const funds = current.budgetCategoryFunds || []
    const exists = funds.some(item => item.projectId === funding.projectId && item.categoryCode === funding.categoryCode)
    current.budgetCategoryFunds = exists
      ? funds.map(item => item.projectId === funding.projectId && item.categoryCode === funding.categoryCode ? funding : item)
      : [...funds, funding]
    writeWorkspace(current)
    renderBudgetFeature(true)
  }

  const updateProject = (patch: { budget?: number }) => {
    const current = readWorkspace()
    if (!current) return
    current.projects = current.projects.map(item => item.id === projectId ? { ...item, ...patch, updated: new Date().toISOString() } : item)
    writeWorkspace(current)
    renderBudgetFeature(true)
  }

  return <BudgetSheet
    project={project}
    lines={lines}
    categoryFunds={categoryFunds}
    onSaveLine={saveLine}
    onDeleteLine={deleteLine}
    onSaveCategoryFunding={saveCategoryFunding}
    onUpdateProject={updateProject}
  />
}

function currentProject(): { project: Project; anchor: Element } | null {
  const eyebrow = Array.from(document.querySelectorAll('.project-hero .eyebrow')).find(node => node.textContent?.trim().startsWith('Project '))
  const anchor = document.querySelector('.progress-panel')
  if (!eyebrow || !anchor) return null
  const number = eyebrow.textContent?.replace(/^Project\s+/, '').trim()
  const workspace = readWorkspace()
  const project = workspace?.projects.find(item => item.number === number)
  return project ? { project, anchor } : null
}

export function renderBudgetFeature(force = false) {
  const current = currentProject()
  if (!current) {
    document.querySelectorAll<HTMLElement>('.budget-host').forEach(host => {
      roots.get(host)?.unmount()
      roots.delete(host)
      host.remove()
    })
    activeProjectId = ''
    activeSnapshot = ''
    return
  }

  const workspace = readWorkspace()
  const snapshot = JSON.stringify({
    project: workspace?.projects.find(item => item.id === current.project.id),
    budgetLines: (workspace?.budgetLines || []).filter(line => line.projectId === current.project.id),
    categoryFunds: (workspace?.budgetCategoryFunds || []).filter(item => item.projectId === current.project.id),
  })
  if (!force && activeProjectId === current.project.id && activeSnapshot === snapshot && document.querySelector('.budget-host')) return

  let host = document.querySelector<HTMLElement>('.budget-host')
  if (!host) {
    host = document.createElement('div')
    host.className = 'budget-host'
    current.anchor.insertAdjacentElement('afterend', host)
  }
  let root = roots.get(host)
  if (!root) {
    root = createRoot(host)
    roots.set(host, root)
  }
  root.render(<BudgetProjectMount projectId={current.project.id} />)
  activeProjectId = current.project.id
  activeSnapshot = snapshot
}

if (typeof window !== 'undefined') {
  window.setInterval(() => renderBudgetFeature(), 350)
  window.addEventListener('load', () => renderBudgetFeature(true), { once: true })
}
