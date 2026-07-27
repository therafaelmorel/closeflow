import { createContext, useContext } from 'react'

export type AccessRole = 'owner' | 'editor' | 'viewer'

export type CurrentUser = {
  id: string
  name: string
  email: string
  role: string
  workspaceId: string
  workspaceName: string
  accessRole: string
}

export const AuthContext = createContext<CurrentUser | null>(null)

export const useAuth = () => useContext(AuthContext)

/** Viewers can read the workspace but never write to it. */
export const useReadOnly = () => (useContext(AuthContext)?.accessRole ?? 'owner') === 'viewer'
