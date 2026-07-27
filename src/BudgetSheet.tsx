import { useId, useMemo, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import './budget.css'

/** Category codes are free text so a project can add the categories it needs. */
export type BudgetCategoryCode = string

export type BudgetLine = {
  id: string
  projectId: string
  categoryCode: BudgetCategoryCode
  description: string
  vendor: string
  reference: string
  budget: number
  committed: number
  spent: number
  notes: string
}

export type BudgetCategoryFunding = {
  projectId: string
  categoryCode: BudgetCategoryCode
  funded: number
}

/** A category a project added itself, or a renamed standard one. */
export type BudgetCategory = {
  projectId: string
  code: BudgetCategoryCode
  name: string
}

type ResolvedCategory = { code: BudgetCategoryCode; name: string; custom: boolean }

type BudgetProject = {
  id: string
  name: string
  budget: number
  committed: number
}

type BudgetSheetProps = {
  project: BudgetProject
  lines: BudgetLine[]
  categoryFunds: BudgetCategoryFunding[]
  /** Categories this project added or renamed, on top of the standard set. */
  categories?: BudgetCategory[]
  /** Vendors already on this project, offered while naming a new line item. */
  vendorOptions?: string[]
  readOnly?: boolean
  onSaveLine: (line: BudgetLine) => void
  onDeleteLine: (id: string) => void
  onSaveCategoryFunding: (funding: BudgetCategoryFunding) => void
  onSaveCategory?: (category: BudgetCategory) => void
  onDeleteCategory?: (code: BudgetCategoryCode) => void
  onUpdateProject: (patch: { budget?: number }) => void
}

export const defaultBudgetCategories: { code: BudgetCategoryCode; name: string }[] = [
  { code: '0', name: 'Consulting Fee' },
  { code: '1', name: 'Construction' },
  { code: '2', name: 'Contingency' },
  { code: '3', name: 'FF&E' },
  { code: '4', name: 'Hospital Support Fee' },
]

const isDefaultCode = (code: BudgetCategoryCode) => defaultBudgetCategories.some(category => category.code === code)
const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'en', { numeric: true })

/**
 * The standard categories, renamed where this project renamed them, plus the ones it
 * added. A code that only survives on a line item or a funded amount — because the
 * category was removed elsewhere — still gets a block, so no money goes unseen.
 */
function projectBudgetCategories(categories: BudgetCategory[], usedCodes: BudgetCategoryCode[]): ResolvedCategory[] {
  const named = new Map(categories.map(category => [category.code, category.name]))
  const own = categories.filter(category => !isDefaultCode(category.code)).map(category => ({ code: category.code, name: category.name, custom: true }))
  const orphans = [...new Set(usedCodes)]
    .filter(code => !isDefaultCode(code) && !named.has(code))
    .map(code => ({ code, name: `Category ${code}`, custom: true }))
  return [
    ...defaultBudgetCategories.map(category => ({ code: category.code, name: named.get(category.code) || category.name, custom: false })),
    ...own,
    ...orphans,
  ].sort(byCode)
}

/**
 * Each category carries its own colour so a long sheet reads as separate blocks
 * instead of one grey wall. The tones match the status colours used app-wide, and
 * red is left out of the rotation because it means "over funded" on this sheet.
 */
const categoryTones = [
  { accent: '#315a9f', tint: '#eef3fb', edge: '#cfdcf1' },
  { accent: '#2d7141', tint: '#edf6f0', edge: '#c8e2d1' },
  { accent: '#8a6400', tint: '#fdf5e1', edge: '#ebdcaf' },
  { accent: '#1f6b6b', tint: '#eaf6f5', edge: '#c4e2df' },
  { accent: '#5a4b9c', tint: '#f1effb', edge: '#d5cdee' },
  { accent: '#7a3f74', tint: '#f9eff8', edge: '#e6cee3' },
  { accent: '#8d4d17', tint: '#fbf1e8', edge: '#e9d2bc' },
  { accent: '#3f5566', tint: '#eef2f5', edge: '#cfdae2' },
]
const toneOf = (index: number) => {
  const tone = categoryTones[index % categoryTones.length]
  return { '--cat-accent': tone.accent, '--cat-tint': tone.tint, '--cat-edge': tone.edge } as CSSProperties
}

const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0)

const sum = (lines: BudgetLine[], key: 'committed' | 'spent') => lines.reduce((total, line) => total + Number(line[key] || 0), 0)
const amountIsOpen = (value: number) => Math.abs(value) > 0.009

/** The lowest whole number not already used as a category code. */
const nextCategoryCode = (categories: ResolvedCategory[]) => {
  const used = new Set(categories.map(category => category.code))
  let next = 0
  while (used.has(String(next))) next += 1
  return String(next)
}

export default function BudgetSheet({
  project,
  lines,
  categoryFunds,
  categories = [],
  vendorOptions = [],
  readOnly = false,
  onSaveLine,
  onDeleteLine,
  onSaveCategoryFunding,
  onSaveCategory,
  onDeleteCategory,
  onUpdateProject,
}: BudgetSheetProps) {
  const [addingCategory, setAddingCategory] = useState<BudgetCategoryCode | null>(null)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editingTotal, setEditingTotal] = useState(false)
  const [totalBudget, setTotalBudget] = useState(String(project.budget || 0))
  const [categoryDraft, setCategoryDraft] = useState<{ mode: 'add' | 'rename'; code: string; name: string } | null>(null)
  const [categoryError, setCategoryError] = useState('')
  const vendorListId = useId()

  const visibleCategories = useMemo(
    () => projectBudgetCategories(categories, [...lines.map(line => line.categoryCode), ...categoryFunds.map(fund => fund.categoryCode)]),
    [categories, lines, categoryFunds],
  )
  const canEditCategories = !readOnly && Boolean(onSaveCategory)

  const calculations = useMemo(() => {
    const categoryFunded = categoryFunds.reduce((total, category) => total + Number(category.funded || 0), 0)
    const committedFromLines = sum(lines, 'committed')
    const committed = lines.length ? committedFromLines : project.committed
    const spent = sum(lines, 'spent')
    const unspentCommits = committed - spent
    const mainUncommittedFunds = project.budget - categoryFunded
    const fundedButUncommitted = categoryFunded - committed
    return { categoryFunded, committed, spent, unspentCommits, mainUncommittedFunds, fundedButUncommitted }
  }, [categoryFunds, lines, project.budget, project.committed])

  const warnings = [
    calculations.categoryFunded > project.budget
      ? `Category funding exceeds the total project budget by ${money(calculations.categoryFunded - project.budget)}.`
      : '',
    calculations.spent > calculations.committed
      ? `Spending exceeds approved commitments by ${money(calculations.spent - calculations.committed)}.`
      : '',
  ].filter(Boolean)

  const saveTotalBudget = (event: FormEvent) => {
    event.preventDefault()
    onUpdateProject({ budget: Math.max(0, Number(totalBudget || 0)) })
    setEditingTotal(false)
  }

  const openNewCategory = () => {
    setCategoryError('')
    setCategoryDraft({ mode: 'add', code: nextCategoryCode(visibleCategories), name: '' })
  }

  const openRenameCategory = (category: ResolvedCategory) => {
    setCategoryError('')
    setCategoryDraft({ mode: 'rename', code: category.code, name: category.name })
  }

  const saveCategory = (event: FormEvent) => {
    event.preventDefault()
    if (!categoryDraft || !onSaveCategory) return
    const code = categoryDraft.code.trim()
    const name = categoryDraft.name.trim()
    if (!code || !name) return setCategoryError('A category needs both a code and a name.')
    if (categoryDraft.mode === 'add' && visibleCategories.some(category => category.code === code)) {
      return setCategoryError(`Category ${code} already exists on this project.`)
    }
    onSaveCategory({ projectId: project.id, code, name })
    setCategoryDraft(null)
  }

  const removeCategory = (category: ResolvedCategory) => {
    if (!onDeleteCategory) return
    const count = lines.filter(line => line.categoryCode === category.code).length
    const detail = count ? ` Its ${count} line item${count === 1 ? '' : 's'} and funded amount will be deleted with it.` : ''
    if (confirm(`Remove category ${category.code} — ${category.name}?${detail}`)) onDeleteCategory(category.code)
  }

  return <section className="budget-sheet section-gap">
    <div className="budget-heading">
      <div>
        <span className="eyebrow">Project financial reconciliation</span>
        <h2>Budget sheet</h2>
        <p>Assign the approved project budget to hospital cost categories, then reconcile each commitment against what has actually been spent.</p>
      </div>
      {!readOnly && <button className="budget-text-button" onClick={() => { setTotalBudget(String(project.budget || 0)); setEditingTotal(true) }}>Edit total budget</button>}
    </div>

    <datalist id={vendorListId}>{vendorOptions.map(vendor => <option key={vendor} value={vendor} />)}</datalist>

    <div className="budget-summary">
      <SummaryCard label="Total budget" value={money(project.budget)} detail="Approved project funding" />
      <SummaryCard label="Category funded" value={money(calculations.categoryFunded)} detail="Allocated across cost categories" />
      <SummaryCard label="Committed approved" value={money(calculations.committed)} detail={`${money(calculations.fundedButUncommitted)} funded but not committed`} danger={calculations.fundedButUncommitted < 0} />
      <SummaryCard label="Spent to date" value={money(calculations.spent)} detail={`${calculations.committed ? Math.round((calculations.spent / calculations.committed) * 100) : 0}% of commitments spent`} />
      <SummaryCard label="Unspent commits" value={money(calculations.unspentCommits)} detail="Committed but not yet billed or spent" danger={amountIsOpen(calculations.unspentCommits)} />
      <SummaryCard label="Main uncommitted funds" value={money(calculations.mainUncommittedFunds)} detail="Not assigned to a category · potential company savings" danger={calculations.mainUncommittedFunds < 0} />
    </div>

    {warnings.length > 0 && <div className="budget-warning"><div><strong>Reconciliation needs attention</strong>{warnings.map(warning => <p key={warning}>{warning}</p>)}</div></div>}

    <div className="budget-categories-head">
      <div><span className="eyebrow">Cost categories</span><small>{visibleCategories.length} categories · {lines.length} line item{lines.length === 1 ? '' : 's'}</small></div>
      {canEditCategories && <button className="budget-text-button" onClick={openNewCategory}>+ Add category</button>}
    </div>

    <div className="budget-categories">
      {visibleCategories.map((category, index) => {
        const categoryLines = lines.filter(line => line.categoryCode === category.code)
        const legacyFunded = categoryLines.reduce((total, line) => total + Number(line.budget || 0), 0)
        const funded = categoryFunds.find(item => item.categoryCode === category.code)?.funded ?? legacyFunded
        const committed = sum(categoryLines, 'committed')
        const spent = sum(categoryLines, 'spent')
        const unspent = committed - spent
        const categoryAvailable = funded - committed
        const overFunded = categoryAvailable < -0.009

        return <article className={`budget-category ${overFunded ? 'over-funded' : ''}`} style={toneOf(index)} key={category.code}>
          <header className="budget-category-header">
            <div className="budget-category-title">
              <span className="budget-category-code" aria-hidden="true">{category.code}</span>
              <div>
                <h3>{category.name}</h3>
                <small>Category {category.code} · {categoryLines.length} commitment{categoryLines.length === 1 ? '' : 's'}{category.custom ? ' · added by this project' : ''}</small>
              </div>
            </div>
            <div className="budget-category-totals">
              {readOnly
                ? <Metric label="Funded amount" value={money(funded)} />
                : <CategoryFundingInput
                    funded={funded}
                    onSave={value => onSaveCategoryFunding({ projectId: project.id, categoryCode: category.code, funded: value })}
                  />}
              <Metric label="Committed" value={money(committed)} />
              <Metric label="Spent" value={money(spent)} />
              <Metric label="Category funds remaining" value={money(categoryAvailable)} danger={categoryAvailable < 0} />
            </div>
            {!readOnly && <div className="budget-category-actions">
              <button className="budget-add-line" onClick={() => { setEditingLineId(null); setAddingCategory(category.code) }}>Add line item</button>
              {canEditCategories && <div className="budget-category-manage">
                <button onClick={() => openRenameCategory(category)}>Rename</button>
                {category.custom && onDeleteCategory && <button className="danger" onClick={() => removeCategory(category)}>Remove</button>}
              </div>}
            </div>}
          </header>

          {overFunded && <div className="budget-category-alert">Approved commitments exceed this category’s funded amount by {money(Math.abs(categoryAvailable))}.</div>}

          <div className="budget-table-wrap">
            <table className="budget-table">
              <thead><tr><th>Vendor / line item</th><th>Committed approved</th><th>Spent to date</th><th>Unspent commits</th><th>Actions</th></tr></thead>
              <tbody>
                {categoryLines.map(line => editingLineId === line.id
                  ? <InlineBudgetRow
                      key={line.id}
                      projectId={project.id}
                      categoryCode={category.code}
                      vendorListId={vendorListId}
                      line={line}
                      onSave={updated => { onSaveLine(updated); setEditingLineId(null) }}
                      onCancel={() => setEditingLineId(null)}
                    />
                  : <BudgetDisplayRow
                      key={line.id}
                      line={line}
                      readOnly={readOnly}
                      onEdit={() => { setAddingCategory(null); setEditingLineId(line.id) }}
                      onDelete={() => { if (confirm(`Delete ${line.vendor || line.description}?`)) onDeleteLine(line.id) }}
                    />
                )}
                {addingCategory === category.code && <InlineBudgetRow
                  projectId={project.id}
                  categoryCode={category.code}
                  vendorListId={vendorListId}
                  onSave={line => { onSaveLine(line); setAddingCategory(null) }}
                  onCancel={() => setAddingCategory(null)}
                />}
                {!categoryLines.length && addingCategory !== category.code && <tr className="budget-empty-row"><td colSpan={5}>No commitments in this category.{!readOnly && <> <button onClick={() => setAddingCategory(category.code)}>Add the first line item</button></>}</td></tr>}
              </tbody>
              <tfoot><tr><td><strong>Category totals</strong><span>Funded: {money(funded)}</span></td><td>{money(committed)}</td><td>{money(spent)}</td><td className={amountIsOpen(unspent) ? 'budget-unspent' : ''}>{money(unspent)}</td><td /></tr></tfoot>
            </table>
          </div>
        </article>
      })}
    </div>

    <div className="budget-reconciliation">
      <div><span>Total project budget</span><strong>{money(project.budget)}</strong></div>
      <div><span>Total category funding</span><strong>{money(calculations.categoryFunded)}</strong></div>
      <div><span>Funded but uncommitted</span><strong className={calculations.fundedButUncommitted < 0 ? 'danger-text' : ''}>{money(calculations.fundedButUncommitted)}</strong></div>
      <div><span>Main uncommitted funds</span><strong className={calculations.mainUncommittedFunds < 0 ? 'danger-text' : ''}>{money(calculations.mainUncommittedFunds)}</strong><small>Potential company savings</small></div>
    </div>

    {editingTotal && <div className="modal-wrap"><button className="modal-scrim" onClick={() => setEditingTotal(false)} /><div className="modal budget-total-modal"><div className="modal-head"><h2>Edit total project budget</h2><button className="icon" onClick={() => setEditingTotal(false)}>×</button></div><form className="form" onSubmit={saveTotalBudget}><label>Total approved budget<input autoFocus required min="0" step="0.01" type="number" value={totalBudget} onChange={event => setTotalBudget(event.target.value)} /></label><button className="primary full" type="submit">Save total budget</button></form></div></div>}

    {categoryDraft && <div className="modal-wrap"><button className="modal-scrim" onClick={() => setCategoryDraft(null)} /><div className="modal budget-category-modal">
      <div className="modal-head"><h2>{categoryDraft.mode === 'add' ? 'Add cost category' : 'Rename cost category'}</h2><button className="icon" onClick={() => setCategoryDraft(null)}>×</button></div>
      <form className="form" onSubmit={saveCategory}>
        <div className="form-row">
          <label>Category code<input required disabled={categoryDraft.mode === 'rename'} maxLength={8} value={categoryDraft.code} onChange={event => setCategoryDraft(draft => draft && { ...draft, code: event.target.value })} /></label>
          <label>Category name<input autoFocus={categoryDraft.mode === 'rename'} required maxLength={80} value={categoryDraft.name} onChange={event => setCategoryDraft(draft => draft && { ...draft, name: event.target.value })} placeholder="e.g. Equipment Rental" /></label>
        </div>
        {categoryError && <p className="budget-form-error">{categoryError}</p>}
        <button className="primary full" type="submit">{categoryDraft.mode === 'add' ? 'Add category' : 'Save category name'}</button>
      </form>
    </div></div>}
  </section>
}

function SummaryCard({ label, value, detail, danger = false }: { label: string; value: string; detail: string; danger?: boolean }) {
  return <div className={`budget-summary-card ${danger ? 'danger' : ''}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="budget-metric"><span>{label}</span><strong className={danger ? 'danger-text' : ''}>{value}</strong></div>
}

function CategoryFundingInput({ funded, onSave }: { funded: number; onSave: (value: number) => void }) {
  const [value, setValue] = useState(String(funded || ''))
  const commit = () => {
    const next = Math.max(0, Number(value || 0))
    setValue(String(next || ''))
    if (Math.abs(next - funded) > 0.009) onSave(next)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }
  return <label className="budget-funded-input"><span>Funded amount</span><div><b>$</b><input aria-label="Category funded amount" min="0" step="0.01" type="number" value={value} onChange={event => setValue(event.target.value)} onBlur={commit} onKeyDown={onKeyDown} placeholder="0" /></div></label>
}

function BudgetDisplayRow({ line, readOnly, onEdit, onDelete }: { line: BudgetLine; readOnly: boolean; onEdit: () => void; onDelete: () => void }) {
  const unspent = line.committed - line.spent
  return <tr><td><strong>{line.vendor || line.description}</strong>{line.reference && <span>{line.reference}</span>}</td><td>{money(line.committed)}</td><td>{money(line.spent)}</td><td className={amountIsOpen(unspent) ? 'budget-unspent' : ''}>{money(unspent)}</td><td>{!readOnly && <div className="budget-actions"><button onClick={onEdit}>Edit</button><button className="danger" onClick={onDelete}>Delete</button></div>}</td></tr>
}

function InlineBudgetRow({ projectId, categoryCode, vendorListId, line, onSave, onCancel }: {
  projectId: string
  categoryCode: BudgetCategoryCode
  vendorListId: string
  line?: BudgetLine
  onSave: (line: BudgetLine) => void
  onCancel: () => void
}) {
  const [vendor, setVendor] = useState(line?.vendor || line?.description || '')
  const [committed, setCommitted] = useState(String(line?.committed || ''))
  const [spent, setSpent] = useState(String(line?.spent || ''))
  const unspent = Number(committed || 0) - Number(spent || 0)

  const save = () => {
    if (!vendor.trim()) return
    onSave({
      id: line?.id || crypto.randomUUID(),
      projectId,
      categoryCode,
      description: vendor.trim(),
      vendor: vendor.trim(),
      reference: line?.reference || '',
      budget: line?.budget || 0,
      committed: Math.max(0, Number(committed || 0)),
      spent: Math.max(0, Number(spent || 0)),
      notes: line?.notes || '',
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      save()
    }
    if (event.key === 'Escape') onCancel()
  }

  return <tr className="budget-inline-row">
    <td><input autoFocus aria-label="Vendor or line-item name" list={vendorListId} value={vendor} onChange={event => setVendor(event.target.value)} onKeyDown={onKeyDown} placeholder="Vendor or line-item name" /></td>
    <td><MoneyInput label="Committed approved" value={committed} setValue={setCommitted} onKeyDown={onKeyDown} /></td>
    <td><MoneyInput label="Spent to date" value={spent} setValue={setSpent} onKeyDown={onKeyDown} /></td>
    <td className={amountIsOpen(unspent) ? 'budget-unspent' : ''}><strong>{money(unspent)}</strong></td>
    <td><div className="budget-actions"><button className="save" onClick={save} disabled={!vendor.trim()}>Save</button><button onClick={onCancel}>Cancel</button></div></td>
  </tr>
}

function MoneyInput({ label, value, setValue, onKeyDown }: { label: string; value: string; setValue: (value: string) => void; onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void }) {
  return <div className="budget-money-input"><b>$</b><input aria-label={label} min="0" step="0.01" type="number" value={value} onChange={event => setValue(event.target.value)} onKeyDown={onKeyDown} placeholder="0" /></div>
}
