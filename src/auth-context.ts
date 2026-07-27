import { createContext, useContext } from 'react'

export type AccessRole = 'owner' | 'manager' | 'editor' | 'viewer'

export type WorkspaceSummary = {
  id: string
  name: string
  accessRole: string
}

export type CurrentUser = {
  id: string
  name: string
  email: string
  role: string
  department: string
  workspaceId: string
  workspaceName: string
  accessRole: string
  /** Every workspace this account belongs to: its own, plus any it was invited into. */
  workspaces: WorkspaceSummary[]
}

export const AuthContext = createContext<CurrentUser | null>(null)

export const useAuth = () => useContext(AuthContext)

/** Viewers can read the workspace but never write to it. */
export const useReadOnly = () => (useContext(AuthContext)?.accessRole ?? 'owner') === 'viewer'
