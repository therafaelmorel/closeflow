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
}

export {}
