import { useId, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import './budget.css'

export type BudgetCategoryCode = '0' | '1' | '2' | '3' | '4'

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
  /** Vendors already on this project, offered while naming a new line item. */
  vendorOptions?: string[]
  readOnly?: boolean
  onSaveLine: (line: BudgetLine) => void
  onDeleteLine: (id: string) => void
  onSaveCategoryFunding: (funding: BudgetCategoryFunding) => void
  onUpdateProject: (patch: { budget?: number }) => void
}

export const budgetCategories: { code: BudgetCategoryCode; name: string }[] = [
  { code: '0', name: 'Consulting Fee' },
  { code: '1', name: 'Construction' },
  { code: '2', name: 'Contingency' },
  { code: '3', name: 'FF&E' },
  { code: '4', name: 'Hospital Support Fee' },
]

const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0)

const sum = (lines: BudgetLine[], key: 'committed' | 'spent') => lines.reduce((total, line) => total + Number(line[key] || 0), 0)
const amountIsOpen = (value: number) => Math.abs(value) > 0.009

export default function BudgetSheet({
  project,
  lines,
  categoryFunds,
  vendorOptions = [],
  readOnly = false,
  onSaveLine,
  onDeleteLine,
  onSaveCategoryFunding,
  onUpdateProject,
}: BudgetSheetProps) {
  const [addingCategory, setAddingCategory] = useState<BudgetCategoryCode | null>(null)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editingTotal, setEditingTotal] = useState(false)
  const [totalBudget, setTotalBudget] = useState(String(project.budget || 0))
  const vendorListId = useId()

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

    <div className="budget-categories">
      {budgetCategories.map(category => {
        const categoryLines = lines.filter(line => line.categoryCode === category.code)
        const legacyFunded = categoryLines.reduce((total, line) => total + Number(line.budget || 0), 0)
        const funded = categoryFunds.find(item => item.categoryCode === category.code)?.funded ?? legacyFunded
        const committed = sum(categoryLines, 'committed')
        const spent = sum(categoryLines, 'spent')
        const unspent = committed - spent
        const categoryAvailable = funded - committed
        const overFunded = categoryAvailable < -0.009

        return <article className={`budget-category ${overFunded ? 'over-funded' : ''}`} key={category.code}>
          <header className="budget-category-header">
            <div className="budget-category-title">
              <span>Category {category.code}</span>
              <h3>{category.name}</h3>
              <small>{categoryLines.length} commitment{categoryLines.length === 1 ? '' : 's'}</small>
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
            {!readOnly && <button className="budget-add-line" onClick={() => { setEditingLineId(null); setAddingCategory(category.code) }}>Add line item</button>}
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

void (0 as unknown as ReactNode)
