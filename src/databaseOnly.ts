const WORKSPACE_KEY = 'closeflow-v1'
const LEGACY_KEYS = ['closeflow-account-v1', 'closeflow-session-v1']

declare global {
  interface Window {
    __closeflowDatabaseOnly?: boolean
  }
}

if (typeof window !== 'undefined' && !window.__closeflowDatabaseOnly) {
  window.__closeflowDatabaseOnly = true

  const nativeGetItem = Storage.prototype.getItem
  const nativeSetItem = Storage.prototype.setItem
  const nativeRemoveItem = Storage.prototype.removeItem
  const nativeClear = Storage.prototype.clear
  let workspaceMemory: string | null = null

  try {
    Reflect.apply(nativeRemoveItem, window.localStorage, [WORKSPACE_KEY])
    for (const key of LEGACY_KEYS) Reflect.apply(nativeRemoveItem, window.localStorage, [key])
    Reflect.apply(nativeRemoveItem, window.sessionStorage, ['closeflow-session-v1'])
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  Storage.prototype.getItem = function getItem(key: string) {
    if (this === window.localStorage && key === WORKSPACE_KEY) return workspaceMemory
    return Reflect.apply(nativeGetItem, this, [key])
  }

  Storage.prototype.setItem = function setItem(key: string, value: string) {
    if (this === window.localStorage && key === WORKSPACE_KEY) {
      workspaceMemory = String(value)
      return
    }
    Reflect.apply(nativeSetItem, this, [key, value])
  }

  Storage.prototype.removeItem = function removeItem(key: string) {
    if (this === window.localStorage && key === WORKSPACE_KEY) {
      workspaceMemory = null
      return
    }
    Reflect.apply(nativeRemoveItem, this, [key])
  }

  Storage.prototype.clear = function clear() {
    if (this === window.localStorage) workspaceMemory = null
    Reflect.apply(nativeClear, this, [])
  }

  const copyReplacements = new Map<string, string>([
    ['Private local workspace', 'Shared database workspace'],
    ['Your account and project records stay in this browser.', 'Accounts and project records are stored securely in Neon Postgres.'],
    ['Manage the local CloseFlow workspace and prepare it for future team integrations.', 'Manage the shared CloseFlow workspace and its database-backed records.'],
    ['Local data', 'Neon Postgres'],
    ['This MVP stores project data in this browser, allowing it to work immediately without a database.', 'Projects, invoices, closeout items, and activity are stored in the connected Neon Postgres database.'],
    ['Team database', 'Database status'],
    ['Supabase or PostgreSQL can be connected next for secure multi-user access and shared attachments.', 'Neon Postgres is connected through Vercel for secure shared access.'],
    ['Future release', 'Connected'],
    ['Your existing browser data remains untouched and will be imported after the administrator account is created.', 'Project and account records are stored through the connected Neon database.'],
  ])

  const updateVisibleCopy = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node: Node | null = walker.nextNode()
    while (node) {
      const value = node.nodeValue?.trim()
      if (value && copyReplacements.has(value)) node.nodeValue = copyReplacements.get(value) || value
      node = walker.nextNode()
    }
  }

  const startCopyObserver = () => {
    updateVisibleCopy()
    const observer = new MutationObserver(updateVisibleCopy)
    observer.observe(document.body, { childList: true, subtree: true })
  }

  if (document.body) startCopyObserver()
  else window.addEventListener('DOMContentLoaded', startCopyObserver, { once: true })
}

export {}
