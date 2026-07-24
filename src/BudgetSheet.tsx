import { useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
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

type BudgetProject = {
  id: string
  name: string
  budget: number
  committed: number
}

type BudgetSheetProps = {
  project: BudgetProject
  lines: BudgetLine[]
  onSaveLine: (line: BudgetLine) => void
  onDeleteLine: (id: string) => void
  onUpdateProject: (patch: { budget?: number }) => void
}

type EditorState = { mode: 'new'; categoryCode: BudgetCategoryCode } | { mode: 'edit'; line: BudgetLine } | null

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

const sum = (lines: BudgetLine[], key: 'budget' | 'committed' | 'spent') => lines.reduce((total, line) => total + Number(line[key] || 0), 0)

export default function BudgetSheet({ project, lines, onSaveLine, onDeleteLine, onUpdateProject }: BudgetSheetProps) {
  const [editor, setEditor] = useState<EditorState>(null)
  const [editingTotal, setEditingTotal] = useState(false)
  const [totalBudget, setTotalBudget] = useState(String(project.budget || 0))

  const calculations = useMemo(() => {
    const allocatedBudget = sum(lines, 'budget')
    const committedFromLines = sum(lines, 'committed')
    const committed = lines.length ? committedFromLines : project.committed
    const spent = sum(lines, 'spent')
    const unspentCommits = committed - spent
    const uncommittedBudget = project.budget - committed
    const unallocatedBudget = project.budget - allocatedBudget
    return { allocatedBudget, committed, spent, unspentCommits, uncommittedBudget, unallocatedBudget }
  }, [lines, project.budget, project.committed])

  const warnings = [
    calculations.committed > project.budget
      ? `Approved commitments exceed the total project budget by ${money(calculations.committed - project.budget)}.`
      : '',
    calculations.spent > calculations.committed
      ? `Spending exceeds approved commitments by ${money(calculations.spent - calculations.committed)}.`
      : '',
    lines.length && Math.abs(calculations.unallocatedBudget) > 0.009
      ? `${money(Math.abs(calculations.unallocatedBudget))} of the project budget is ${calculations.unallocatedBudget > 0 ? 'not yet allocated to a category' : 'over-allocated across categories'}.`
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
        <p>Organize the approved budget, commitments, spending, and remaining committed balances by hospital cost category.</p>
      </div>
      <button className="secondary" onClick={() => setEditor({ mode: 'new', categoryCode: '1' })}><Plus />Add line item</button>
    </div>

    <div className="budget-summary">
      <SummaryCard label="Total budget" value={money(project.budget)} detail={`${money(calculations.allocatedBudget)} allocated`} icon={<CircleDollarSign />} action={<button onClick={() => { setTotalBudget(String(project.budget || 0)); setEditingTotal(true) }}>Edit</button>} />
      <SummaryCard label="Committed approved" value={money(calculations.committed)} detail={`${money(calculations.uncommittedBudget)} not committed`} icon={<CheckCircle2 />} />
      <SummaryCard label="Spent to date" value={money(calculations.spent)} detail={`${calculations.committed ? Math.round((calculations.spent / calculations.committed) * 100) : 0}% of commitments spent`} icon={<Calculator />} />
      <SummaryCard label="Unspent commits" value={money(calculations.unspentCommits)} detail={calculations.unspentCommits >= 0 ? 'Committed but not yet spent' : 'Spending exceeds commitments'} icon={<AlertTriangle />} danger={calculations.unspentCommits < 0} />
    </div>

    {!lines.length && <div className="budget-onboarding"><Calculator /><div><strong>Start the project reconciliation</strong><p>The existing project budget and committed balance are shown above. Add line items to assign those amounts to the five cost categories and record spending.</p></div><button className="primary" onClick={() => setEditor({ mode: 'new', categoryCode: '1' })}><Plus />Add first line</button></div>}

    {warnings.length > 0 && <div className="budget-warning"><AlertTriangle /><div><strong>Reconciliation needs attention</strong>{warnings.map(warning => <p key={warning}>{warning}</p>)}</div></div>}

    <div className="budget-categories">
      {budgetCategories.map(category => {
        const categoryLines = lines.filter(line => line.categoryCode === category.code)
        const budget = sum(categoryLines, 'budget')
        const committed = sum(categoryLines, 'committed')
        const spent = sum(categoryLines, 'spent')
        const unspent = committed - spent
        return <article className="budget-category" key={category.code}>
          <header>
            <div className="budget-category-title"><span>{category.code}</span><div><h3>{category.name}</h3><small>{categoryLines.length} line item{categoryLines.length === 1 ? '' : 's'}</small></div></div>
            <div className="budget-category-totals"><div><span>Budget</span><strong>{money(budget)}</strong></div><div><span>Committed</span><strong>{money(committed)}</strong></div><div><span>Spent</span><strong>{money(spent)}</strong></div><div><span>Unspent commits</span><strong className={unspent < 0 ? 'danger-text' : ''}>{money(unspent)}</strong></div></div>
            <button className="icon" aria-label={`Add ${category.name} line`} title={`Add ${category.name} line`} onClick={() => setEditor({ mode: 'new', categoryCode: category.code })}><Plus /></button>
          </header>
          {categoryLines.length ? <div className="budget-table-wrap"><table className="budget-table"><thead><tr><th>Line item</th><th>Vendor / reference</th><th>Budget</th><th>Committed approved</th><th>Spent to date</th><th>Unspent commits</th><th aria-label="Actions" /></tr></thead><tbody>{categoryLines.map(line => {
            const lineUnspent = line.committed - line.spent
            return <tr key={line.id}><td><strong>{line.description}</strong>{line.notes && <span>{line.notes}</span>}</td><td><strong>{line.vendor || '—'}</strong><span>{line.reference || 'No reference'}</span></td><td>{money(line.budget)}</td><td>{money(line.committed)}</td><td>{money(line.spent)}</td><td className={lineUnspent < 0 ? 'danger-text' : ''}>{money(lineUnspent)}</td><td><div className="budget-actions"><button aria-label="Edit line" title="Edit line" onClick={() => setEditor({ mode: 'edit', line })}><Pencil /></button><button className="danger" aria-label="Delete line" title="Delete line" onClick={() => { if (confirm(`Delete ${line.description}?`)) onDeleteLine(line.id) }}><Trash2 /></button></div></td></tr>
          })}</tbody><tfoot><tr><td colSpan={2}>Category subtotal</td><td>{money(budget)}</td><td>{money(committed)}</td><td>{money(spent)}</td><td className={unspent < 0 ? 'danger-text' : ''}>{money(unspent)}</td><td /></tr></tfoot></table></div> : <div className="budget-empty-category"><span>No line items in this category.</span><button onClick={() => setEditor({ mode: 'new', categoryCode: category.code })}>Add line item</button></div>}
        </article>
      })}
    </div>

    <div className="budget-reconciliation">
      <div><span>Total project budget</span><strong>{money(project.budget)}</strong></div>
      <div><span>Category allocations</span><strong>{money(calculations.allocatedBudget)}</strong></div>
      <div><span>Unallocated budget</span><strong className={calculations.unallocatedBudget < 0 ? 'danger-text' : ''}>{money(calculations.unallocatedBudget)}</strong></div>
      <div><span>Uncommitted budget</span><strong className={calculations.uncommittedBudget < 0 ? 'danger-text' : ''}>{money(calculations.uncommittedBudget)}</strong></div>
    </div>

    {editor && <BudgetLineEditor projectId={project.id} editor={editor} close={() => setEditor(null)} save={(line) => { onSaveLine(line); setEditor(null) }} />}
    {editingTotal && <div className="modal-wrap"><button className="modal-scrim" onClick={() => setEditingTotal(false)} /><div className="modal budget-total-modal"><div className="modal-head"><h2>Edit total project budget</h2><button className="icon" onClick={() => setEditingTotal(false)}><X /></button></div><form className="form" onSubmit={saveTotalBudget}><label>Total approved budget<input autoFocus required min="0" step="0.01" type="number" value={totalBudget} onChange={event => setTotalBudget(event.target.value)} /></label><button className="primary full" type="submit">Save total budget</button></form></div></div>}
  </section>
}

function SummaryCard({ label, value, detail, icon, action, danger = false }: { label: string; value: string; detail: string; icon: React.ReactNode; action?: React.ReactNode; danger?: boolean }) {
  return <div className={`budget-summary-card ${danger ? 'danger' : ''}`}><div className="budget-summary-icon">{icon}</div><div className="budget-summary-label"><span>{label}</span>{action}</div><strong>{value}</strong><small>{detail}</small></div>
}

function BudgetLineEditor({ projectId, editor, close, save }: { projectId: string; editor: Exclude<EditorState, null>; close: () => void; save: (line: BudgetLine) => void }) {
  const existing = editor.mode === 'edit' ? editor.line : null
  const [form, setForm] = useState({
    categoryCode: existing?.categoryCode || editor.categoryCode,
    description: existing?.description || '',
    vendor: existing?.vendor || '',
    reference: existing?.reference || '',
    budget: String(existing?.budget || ''),
    committed: String(existing?.committed || ''),
    spent: String(existing?.spent || ''),
    notes: existing?.notes || '',
  })
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    save({
      id: existing?.id || crypto.randomUUID(),
      projectId,
      categoryCode: form.categoryCode as BudgetCategoryCode,
      description: form.description.trim() || 'Untitled budget line',
      vendor: form.vendor.trim(),
      reference: form.reference.trim(),
      budget: Math.max(0, Number(form.budget || 0)),
      committed: Math.max(0, Number(form.committed || 0)),
      spent: Math.max(0, Number(form.spent || 0)),
      notes: form.notes.trim(),
    })
  }
  const unspent = Number(form.committed || 0) - Number(form.spent || 0)
  return <div className="modal-wrap"><button className="modal-scrim" onClick={close} /><div className="modal budget-editor"><div className="modal-head"><div><span className="eyebrow">Project budget</span><h2>{existing ? 'Edit line item' : 'Add line item'}</h2></div><button className="icon" onClick={close}><X /></button></div><form className="form" onSubmit={submit}><label>Category<select value={form.categoryCode} onChange={event => set('categoryCode', event.target.value)}>{budgetCategories.map(category => <option value={category.code} key={category.code}>{category.code} — {category.name}</option>)}</select></label><label>Line-item description<input required value={form.description} onChange={event => set('description', event.target.value)} placeholder="Example: General contractor base contract" /></label><div className="form-row"><label>Vendor / payee<input value={form.vendor} onChange={event => set('vendor', event.target.value)} placeholder="Vendor or consultant" /></label><label>Reference / PO<input value={form.reference} onChange={event => set('reference', event.target.value)} placeholder="PO, contract, or change order" /></label></div><div className="form-row budget-three"><label>Budget allocation<input min="0" step="0.01" type="number" value={form.budget} onChange={event => set('budget', event.target.value)} /></label><label>Committed approved<input min="0" step="0.01" type="number" value={form.committed} onChange={event => set('committed', event.target.value)} /></label><label>Spent to date<input min="0" step="0.01" type="number" value={form.spent} onChange={event => set('spent', event.target.value)} /></label></div><div className={`budget-live-math ${unspent < 0 ? 'danger' : ''}`}><span>Calculated unspent commitment</span><strong>{money(unspent)}</strong></div><label>Notes<textarea rows={3} value={form.notes} onChange={event => set('notes', event.target.value)} placeholder="Optional reconciliation note" /></label><button className="primary full" type="submit">{existing ? 'Save changes' : 'Add line item'}</button></form></div></div>
}
