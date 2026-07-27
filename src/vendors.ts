import type { BudgetLine } from './BudgetSheet'

export type InvoiceStatus = 'Requested' | 'Received' | 'Reviewing' | 'Correction Needed' | 'Approved' | 'Submitted for Payment' | 'Paid'
export const invoiceStatuses: InvoiceStatus[] = ['Requested', 'Received', 'Reviewing', 'Correction Needed', 'Approved', 'Submitted for Payment', 'Paid']

export type Invoice = {
  id: string
  projectId: string
  vendor: string
  number: string
  amount: number
  po: string
  due: string
  status: InvoiceStatus
  disputed: number
  hold: string
}

/** Where a vendor's closeout letter stands. A project closes once every vendor is settled. */
export type LetterStatus = 'Not Requested' | 'Requested' | 'Received' | 'Accepted' | 'Not Required'
export const letterStatuses: LetterStatus[] = ['Not Requested', 'Requested', 'Received', 'Accepted', 'Not Required']

/** The purchase order and closeout letter tracked for one vendor on one project. */
export type VendorRecord = {
  id: string
  projectId: string
  vendor: string
  poNumber: string
  poAmount: number
  poDate: string
  letterStatus: LetterStatus
  letterRequested: string
  letterReceived: string
  notes: string
}

export type VendorSummary = {
  key: string
  name: string
  record: VendorRecord | null
  lineCount: number
  /** Approved commitment for this vendor, added up from the project's budget lines. */
  commitment: number
  spent: number
  poNumber: string
  poAmount: number
  hasPo: boolean
  invoiced: number
  invoiceCount: number
  paid: number
  outstanding: number
  /** Purchase order against the approved commitment. These have to agree. */
  poVariance: number
  poMatches: boolean
  /** Invoices received against the purchase order. These have to agree too. */
  invoiceVariance: number
  invoiceMatches: boolean
  letterStatus: LetterStatus
  letterSettled: boolean
  reconciled: boolean
  ready: boolean
}

export type VendorReadiness = {
  vendors: number
  settledLetters: number
  reconciled: number
  ready: number
  outstandingLetters: VendorSummary[]
  mismatched: VendorSummary[]
  complete: boolean
}

export const vendorKey = (name: string) => name.trim().toLowerCase()
export const vendorLabel = (line: BudgetLine) => (line.vendor || line.description || '').trim()

const round = (value: number) => Math.round((Number(value) || 0) * 100) / 100
/** Money agrees when it agrees to the cent. */
export const sameMoney = (a: number, b: number) => Math.abs(a - b) < 0.01

export const emptyVendorRecord = (projectId: string, vendor: string): VendorRecord => ({
  id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
  projectId,
  vendor,
  poNumber: '',
  poAmount: 0,
  poDate: '',
  letterStatus: 'Not Requested',
  letterRequested: '',
  letterReceived: '',
  notes: '',
})

/**
 * Builds the vendor list for a project. Vendors come from the budget lines, which is
 * where a vendor name is entered; a vendor that only has a purchase order or an invoice
 * is still listed so nothing invoiced can go untracked.
 */
export function summarizeVendors(lines: BudgetLine[], invoices: Invoice[], records: VendorRecord[]): VendorSummary[] {
  const names = new Map<string, string>()
  const order: string[] = []
  const add = (raw: string) => {
    const name = raw.trim()
    if (!name) return
    const key = vendorKey(name)
    if (names.has(key)) return
    names.set(key, name)
    order.push(key)
  }
  lines.forEach((line) => add(vendorLabel(line)))
  records.forEach((record) => add(record.vendor))
  invoices.forEach((invoice) => add(invoice.vendor))

  return order.map((key) => {
    const name = names.get(key) as string
    const vendorLines = lines.filter((line) => vendorKey(vendorLabel(line)) === key)
    const vendorInvoices = invoices.filter((invoice) => vendorKey(invoice.vendor) === key)
    const record = records.find((item) => vendorKey(item.vendor) === key) ?? null
    const commitment = round(vendorLines.reduce((total, line) => total + Number(line.committed || 0), 0))
    const spent = round(vendorLines.reduce((total, line) => total + Number(line.spent || 0), 0))
    const poNumber = record?.poNumber.trim() || ''
    const poAmount = round(Number(record?.poAmount || 0))
    const hasPo = Boolean(poNumber) || poAmount > 0
    const invoiced = round(vendorInvoices.reduce((total, invoice) => total + Number(invoice.amount || 0), 0))
    const paid = round(vendorInvoices.filter((invoice) => invoice.status === 'Paid').reduce((total, invoice) => total + Number(invoice.amount || 0), 0))
    const letterStatus = record?.letterStatus ?? 'Not Requested'
    const poVariance = round(poAmount - commitment)
    const invoiceVariance = round(invoiced - (hasPo ? poAmount : commitment))
    const poMatches = hasPo && sameMoney(poAmount, commitment)
    const invoiceMatches = sameMoney(invoiced, hasPo ? poAmount : commitment)
    const letterSettled = letterStatus === 'Accepted' || letterStatus === 'Not Required'
    const reconciled = poMatches && invoiceMatches
    return {
      key,
      name,
      record,
      lineCount: vendorLines.length,
      commitment,
      spent,
      poNumber,
      poAmount,
      hasPo,
      invoiced,
      invoiceCount: vendorInvoices.length,
      paid,
      outstanding: round(invoiced - paid),
      poVariance,
      poMatches,
      invoiceVariance,
      invoiceMatches,
      letterStatus,
      letterSettled,
      reconciled,
      ready: reconciled && letterSettled,
    }
  })
}

/** How close the project is to having everything a closeout needs from its vendors. */
export function vendorReadiness(summaries: VendorSummary[]): VendorReadiness {
  const outstandingLetters = summaries.filter((vendor) => !vendor.letterSettled)
  const mismatched = summaries.filter((vendor) => !vendor.reconciled)
  return {
    vendors: summaries.length,
    settledLetters: summaries.length - outstandingLetters.length,
    reconciled: summaries.length - mismatched.length,
    ready: summaries.filter((vendor) => vendor.ready).length,
    outstandingLetters,
    mismatched,
    complete: summaries.length > 0 && outstandingLetters.length === 0 && mismatched.length === 0,
  }
}
