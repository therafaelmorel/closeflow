import { useId, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, CheckCircle2, FileSignature, Plus, ReceiptText } from 'lucide-react'
import {
  emptyVendorRecord, invoiceStatuses, letterStatuses,
  type Invoice, type InvoiceStatus, type LetterStatus, type VendorReadiness, type VendorRecord, type VendorSummary,
} from './vendors'
import './vendors.css'

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)
const prettyDate = (value: string) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : '—'
const today = () => new Date().toISOString().slice(0, 10)
const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
const letterClass = (status: LetterStatus) => `letter-badge ${status.toLowerCase().replaceAll(' ', '-')}`

type VendorTrackerProps = {
  projectId: string
  summaries: VendorSummary[]
  readiness: VendorReadiness
  readOnly: boolean
  onSaveVendor: (record: VendorRecord) => void
  onLog: (action: string, detail: string) => void
}

/**
 * The vendor list for a project, built from the vendors named on its budget lines.
 * Every vendor needs a purchase order that agrees with its approved commitment, invoices
 * that agree with that purchase order, and a signed closeout letter.
 */
export function VendorTracker({ projectId, summaries, readiness, readOnly, onSaveVendor, onLog }: VendorTrackerProps) {
  return <section className="panel section-gap vendor-panel">
    <div className="panel-head">
      <div>
        <span className="eyebrow"><FileSignature style={{ width: 13, verticalAlign: '-2px', marginRight: 5 }} />Vendor closeout</span>
        <h2>Vendors and closeout letters</h2>
        <p className="vendor-note">Every vendor added to a budget line is listed here. A project can close once each vendor's purchase order matches its approved commitment, its invoices match the purchase order, and its closeout letter is in.</p>
      </div>
    </div>

    {summaries.length > 0 && <div className="vendor-readiness">
      <ReadinessStat label="Vendors" value={`${readiness.vendors}`} detail="Named on budget lines" />
      <ReadinessStat label="Closeout letters" value={`${readiness.settledLetters} of ${readiness.vendors}`} detail="Accepted or not required" danger={readiness.outstandingLetters.length > 0} />
      <ReadinessStat label="Reconciled" value={`${readiness.reconciled} of ${readiness.vendors}`} detail="PO, commitment, and invoices agree" danger={readiness.mismatched.length > 0} />
      <ReadinessStat label="Ready to close" value={`${readiness.ready} of ${readiness.vendors}`} detail={readiness.complete ? 'Every vendor is settled' : 'Vendors fully settled'} />
    </div>}

    {readiness.complete && <div className="vendor-clear"><CheckCircle2 />Every vendor is reconciled and its closeout letter is in. This project is clear to close.</div>}

    <div className="vendor-grid">
      {summaries.map((vendor) => <VendorCard
        key={vendor.key}
        projectId={projectId}
        vendor={vendor}
        readOnly={readOnly}
        onSaveVendor={onSaveVendor}
        onLog={onLog}
      />)}
    </div>

    {!summaries.length && <div className="empty"><FileSignature /><p>No vendors yet. Add a budget line with a vendor name and it will appear here with its own purchase order and closeout letter tracker.</p></div>}
  </section>
}

function ReadinessStat({ label, value, detail, danger = false }: { label: string; value: string; detail: string; danger?: boolean }) {
  return <div className={`vendor-readiness-card ${danger ? 'danger' : ''}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function VendorCard({ projectId, vendor, readOnly, onSaveVendor, onLog }: {
  projectId: string
  vendor: VendorSummary
  readOnly: boolean
  onSaveVendor: (record: VendorRecord) => void
  onLog: (action: string, detail: string) => void
}) {
  const [poNumber, setPoNumber] = useState(vendor.poNumber)
  const [poAmount, setPoAmount] = useState(vendor.poAmount ? String(vendor.poAmount) : '')
  const [notes, setNotes] = useState(vendor.record?.notes || '')

  const save = (patch: Partial<VendorRecord>) => {
    const base = vendor.record ?? emptyVendorRecord(projectId, vendor.name)
    onSaveVendor({ ...base, vendor: base.vendor || vendor.name, ...patch })
  }

  const savePoNumber = () => { if (poNumber.trim() !== vendor.poNumber) save({ poNumber: poNumber.trim() }) }
  const savePoAmount = () => {
    const next = Math.max(0, Number(poAmount || 0))
    setPoAmount(next ? String(next) : '')
    if (Math.abs(next - vendor.poAmount) > 0.009) save({ poAmount: next, poDate: vendor.record?.poDate || today() })
  }
  const saveNotes = () => { if (notes !== (vendor.record?.notes || '')) save({ notes }) }

  const setLetterStatus = (status: LetterStatus) => {
    const record = vendor.record
    const patch: Partial<VendorRecord> = { letterStatus: status }
    // Stamp the dates the status implies so the tracker keeps its own history.
    if (status === 'Requested' && !record?.letterRequested) patch.letterRequested = today()
    if ((status === 'Received' || status === 'Accepted') && !record?.letterReceived) patch.letterReceived = today()
    save(patch)
    onLog('Closeout letter updated', `${vendor.name} closeout letter marked ${status.toLowerCase()}.`)
  }

  const matchPoToCommitment = () => {
    save({ poAmount: vendor.commitment, poDate: vendor.record?.poDate || today() })
    setPoAmount(vendor.commitment ? String(vendor.commitment) : '')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }

  return <article className={`vendor-card ${vendor.ready ? 'ready' : ''} ${!vendor.reconciled ? 'flagged' : ''}`}>
    <header>
      <div>
        <h3>{vendor.name}</h3>
        <small>{vendor.lineCount ? `${vendor.lineCount} budget line${vendor.lineCount === 1 ? '' : 's'}` : 'No budget line'} · {vendor.invoiceCount} invoice{vendor.invoiceCount === 1 ? '' : 's'}</small>
      </div>
      <span className={letterClass(vendor.letterStatus)}>{vendor.letterStatus}</span>
    </header>

    <div className="vendor-metrics">
      <div><span>Approved commitment</span><strong>{money(vendor.commitment)}</strong></div>
      <div><span>Purchase order</span><strong className={vendor.hasPo && !vendor.poMatches ? 'danger-text' : ''}>{vendor.hasPo ? money(vendor.poAmount) : '—'}</strong></div>
      <div><span>Invoiced</span><strong className={vendor.invoiceMatches ? '' : 'danger-text'}>{money(vendor.invoiced)}</strong></div>
      <div><span>Paid</span><strong>{money(vendor.paid)}</strong></div>
    </div>

    <div className="vendor-checks">
      <Check
        ok={vendor.poMatches}
        okText="PO matches the approved commitment"
        failText={vendor.hasPo
          ? `PO is ${money(Math.abs(vendor.poVariance))} ${vendor.poVariance > 0 ? 'above' : 'below'} the approved commitment`
          : 'No purchase order recorded for this vendor'}
      />
      <Check
        ok={vendor.invoiceMatches}
        okText={vendor.invoiced ? 'Invoices match the purchase order' : 'Nothing committed or invoiced'}
        failText={`Invoices are ${money(Math.abs(vendor.invoiceVariance))} ${vendor.invoiceVariance > 0 ? 'above' : 'below'} the ${vendor.hasPo ? 'purchase order' : 'approved commitment'}`}
      />
      <Check ok={vendor.letterSettled} okText="Closeout letter settled" failText="Closeout letter still outstanding" />
    </div>

    {readOnly
      ? <dl className="vendor-readonly">
          <div><dt>PO number</dt><dd>{vendor.poNumber || '—'}</dd></div>
          <div><dt>PO date</dt><dd>{prettyDate(vendor.record?.poDate || '')}</dd></div>
          <div><dt>Letter requested</dt><dd>{prettyDate(vendor.record?.letterRequested || '')}</dd></div>
          <div><dt>Letter received</dt><dd>{prettyDate(vendor.record?.letterReceived || '')}</dd></div>
          {vendor.record?.notes && <div className="wide"><dt>Notes</dt><dd>{vendor.record.notes}</dd></div>}
        </dl>
      : <>
          <div className="vendor-fields">
            <label>PO number<input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} onBlur={savePoNumber} onKeyDown={onKeyDown} placeholder="e.g. PO-10482" /></label>
            <label>PO amount<div className="vendor-money"><b>$</b><input type="number" min="0" step="0.01" value={poAmount} onChange={(event) => setPoAmount(event.target.value)} onBlur={savePoAmount} onKeyDown={onKeyDown} placeholder="0" /></div></label>
            <label>PO date<input type="date" value={vendor.record?.poDate || ''} onChange={(event) => save({ poDate: event.target.value })} /></label>
            <label>Closeout letter<select value={vendor.letterStatus} onChange={(event) => setLetterStatus(event.target.value as LetterStatus)}>{letterStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>Letter requested<input type="date" value={vendor.record?.letterRequested || ''} onChange={(event) => save({ letterRequested: event.target.value })} /></label>
            <label>Letter received<input type="date" value={vendor.record?.letterReceived || ''} onChange={(event) => save({ letterReceived: event.target.value })} /></label>
          </div>
          <label className="vendor-notes">Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={saveNotes} onKeyDown={onKeyDown} placeholder="What is still outstanding with this vendor" /></label>
          <div className="vendor-card-actions">
            {!vendor.poMatches && vendor.commitment > 0 && <button className="budget-text-button" onClick={matchPoToCommitment}>Set PO to {money(vendor.commitment)}</button>}
            {!vendor.letterSettled && <button className="budget-text-button" onClick={() => setLetterStatus(vendor.letterStatus === 'Not Requested' ? 'Requested' : 'Accepted')}>{vendor.letterStatus === 'Not Requested' ? 'Mark letter requested' : 'Mark letter accepted'}</button>}
          </div>
        </>}
  </article>
}

function Check({ ok, okText, failText }: { ok: boolean; okText: string; failText: string }) {
  return <div className={`vendor-check ${ok ? 'ok' : 'bad'}`}>{ok ? <CheckCircle2 /> : <AlertTriangle />}<span>{ok ? okText : failText}</span></div>
}

type ProjectInvoicesProps = {
  projectId: string
  invoices: Invoice[]
  vendorOptions: string[]
  poFor: (vendor: string) => string
  readOnly: boolean
  onSave: (invoice: Invoice) => void
  onDelete: (id: string) => void
}

/** Invoices belong to the project they were billed against, and to a vendor on it. */
export function ProjectInvoices({ projectId, invoices, vendorOptions, poFor, readOnly, onSave, onDelete }: ProjectInvoicesProps) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const listId = useId()
  const invoiced = invoices.reduce((total, invoice) => total + Number(invoice.amount || 0), 0)
  const paid = invoices.filter((invoice) => invoice.status === 'Paid').reduce((total, invoice) => total + Number(invoice.amount || 0), 0)

  return <section className="panel section-gap">
    <div className="panel-head">
      <div>
        <span className="eyebrow"><ReceiptText style={{ width: 13, verticalAlign: '-2px', marginRight: 5 }} />Financial</span>
        <h2>Invoices</h2>
      </div>
      {!readOnly && <button className="secondary" onClick={() => { setEditingId(null); setAdding(true) }}><Plus />Add invoice</button>}
    </div>

    <datalist id={listId}>{vendorOptions.map((vendor) => <option key={vendor} value={vendor} />)}</datalist>

    <div className="table-wrap">
      <table className="invoice-table">
        <thead><tr><th>Invoice</th><th>Vendor</th><th>PO</th><th>Amount</th><th>Due</th><th>Status</th><th /></tr></thead>
        <tbody>
          {adding && <InvoiceEditRow
            projectId={projectId}
            listId={listId}
            poFor={poFor}
            onSave={(invoice) => { onSave(invoice); setAdding(false) }}
            onCancel={() => setAdding(false)}
          />}
          {invoices.map((invoice) => editingId === invoice.id
            ? <InvoiceEditRow
                key={invoice.id}
                projectId={projectId}
                listId={listId}
                poFor={poFor}
                invoice={invoice}
                onSave={(updated) => { onSave(updated); setEditingId(null) }}
                onCancel={() => setEditingId(null)}
              />
            : <tr key={invoice.id}>
                <td><strong>{invoice.number}</strong>{invoice.hold && <span>{invoice.hold}</span>}</td>
                <td>{invoice.vendor || '—'}</td>
                <td>{invoice.po || '—'}</td>
                <td>{money(invoice.amount)}</td>
                <td>{prettyDate(invoice.due)}</td>
                <td>{readOnly
                  ? <span className={`status ${invoice.status.toLowerCase().replaceAll(' ', '-')}`}>{invoice.status}</span>
                  : <select value={invoice.status} onChange={(event) => onSave({ ...invoice, status: event.target.value as InvoiceStatus })}>{invoiceStatuses.map((status) => <option key={status}>{status}</option>)}</select>}</td>
                <td>{!readOnly && <div className="budget-actions"><button onClick={() => { setAdding(false); setEditingId(invoice.id) }}>Edit</button><button className="danger" onClick={() => { if (confirm(`Delete invoice ${invoice.number}?`)) onDelete(invoice.id) }}>Delete</button></div>}</td>
              </tr>
          )}
          {!invoices.length && !adding && <tr className="budget-empty-row"><td colSpan={7}>No invoices on this project yet.{!readOnly && <button onClick={() => setAdding(true)}>Add the first invoice</button>}</td></tr>}
        </tbody>
        {invoices.length > 0 && <tfoot><tr><td><strong>Invoice totals</strong></td><td /><td /><td>{money(invoiced)}</td><td /><td>{money(paid)} paid · {money(invoiced - paid)} outstanding</td><td /></tr></tfoot>}
      </table>
    </div>
  </section>
}

function InvoiceEditRow({ projectId, listId, poFor, invoice, onSave, onCancel }: {
  projectId: string
  listId: string
  poFor: (vendor: string) => string
  invoice?: Invoice
  onSave: (invoice: Invoice) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    number: invoice?.number || '',
    vendor: invoice?.vendor || '',
    po: invoice?.po || '',
    amount: invoice ? String(invoice.amount || '') : '',
    due: invoice?.due || today(),
    status: (invoice?.status || 'Requested') as InvoiceStatus,
  })
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))

  // Picking a vendor fills in the purchase order already recorded for it.
  const setVendor = (value: string) => setForm((current) => {
    const po = current.po && current.po !== poFor(current.vendor) ? current.po : poFor(value)
    return { ...current, vendor: value, po }
  })

  const save = () => {
    if (!form.vendor.trim()) return
    onSave({
      id: invoice?.id || uid(),
      projectId,
      vendor: form.vendor.trim(),
      number: form.number.trim() || 'Pending',
      amount: Math.max(0, Number(form.amount || 0)),
      po: form.po.trim(),
      due: form.due || today(),
      status: form.status,
      disputed: invoice?.disputed || 0,
      hold: invoice?.hold || '',
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); save() }
    if (event.key === 'Escape') onCancel()
  }

  return <tr className="budget-inline-row">
    <td><input autoFocus aria-label="Invoice number" value={form.number} onChange={(event) => set('number', event.target.value)} onKeyDown={onKeyDown} placeholder="Invoice number" /></td>
    <td><input aria-label="Vendor" list={listId} value={form.vendor} onChange={(event) => setVendor(event.target.value)} onKeyDown={onKeyDown} placeholder="Vendor" /></td>
    <td><input aria-label="PO number" value={form.po} onChange={(event) => set('po', event.target.value)} onKeyDown={onKeyDown} placeholder="PO number" /></td>
    <td><div className="budget-money-input"><b>$</b><input aria-label="Invoice amount" type="number" min="0" step="0.01" value={form.amount} onChange={(event) => set('amount', event.target.value)} onKeyDown={onKeyDown} placeholder="0" /></div></td>
    <td><input aria-label="Due date" type="date" value={form.due} onChange={(event) => set('due', event.target.value)} onKeyDown={onKeyDown} /></td>
    <td><select aria-label="Invoice status" value={form.status} onChange={(event) => set('status', event.target.value)}>{invoiceStatuses.map((status) => <option key={status}>{status}</option>)}</select></td>
    <td><div className="budget-actions"><button className="save" onClick={save} disabled={!form.vendor.trim()}>Save</button><button onClick={onCancel}>Cancel</button></div></td>
  </tr>
}
