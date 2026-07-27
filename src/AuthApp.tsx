import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Database, Eye, EyeOff, LoaderCircle, LockKeyhole, LogOut, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react'
import { AuthContext, type CurrentUser } from './auth-context'
import { api } from './api'
import './auth.css'

type AuthUser = CurrentUser
type Store = { projects: unknown[]; items: unknown[]; invoices: unknown[]; activities: unknown[] }
type Screen = 'loading' | 'database' | 'setup' | 'login' | 'invite' | 'app' | 'error'
type SyncState = 'synced' | 'saving' | 'error'
type Invite = { email: string; accessRole: string; workspaceName: string; teamName: string; invitedBy: string }

type AuthAppProps = { children: ReactNode }

declare global {
  interface Window { __closeflowReadOnly?: boolean }
}

const DATA_KEY = 'closeflow-v1'
const emptyStore: Store = { projects: [], items: [], invoices: [], activities: [] }
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CF'
const inviteToken = () => new URLSearchParams(window.location.search).get('invite') || ''
const clearInviteToken = () => window.history.replaceState({}, '', window.location.pathname)

export default function AuthApp({ children }: AuthAppProps) {
  const [screen, setScreen] = useState<Screen>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [syncState, setSyncState] = useState<SyncState>('synced')
  const [message, setMessage] = useState('')
  const [invite, setInvite] = useState<Invite | null>(null)

  const loadWorkspace = useCallback(async (nextUser: AuthUser) => {
    const workspace = await api('/api/workspace') as Store
    localStorage.setItem(DATA_KEY, JSON.stringify(workspace || emptyStore))
    setUser(nextUser)
    setScreen('app')
  }, [])

  const bootstrap = useCallback(async () => {
    setScreen('loading')
    setMessage('')
    try {
      const state = await api('/api/auth')
      if (state.authenticated && state.user) {
        if (inviteToken()) clearInviteToken()
        await loadWorkspace(state.user)
        return
      }
      const token = inviteToken()
      if (token) {
        try {
          setInvite(await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'inviteInfo', token }) }) as Invite)
          setScreen('invite')
          return
        } catch {
          clearInviteToken()
        }
      }
      setScreen(state.setupRequired ? 'setup' : 'login')
    } catch (error) {
      const failure = error as Error & { code?: string }
      if (failure.code === 'DATABASE_NOT_CONFIGURED') setScreen('database')
      else { setMessage(failure.message); setScreen('error') }
    }
  }, [loadWorkspace])

  useEffect(() => { void bootstrap() }, [bootstrap])

  // Expose read-only state to the budget feature, which renders in its own React root.
  useEffect(() => { window.__closeflowReadOnly = user?.accessRole === 'viewer' }, [user])

  const authenticate = async (action: 'signup' | 'login', values: { name?: string; email: string; role?: string; password: string; remember: boolean }) => {
    await api('/api/auth', { method: 'POST', body: JSON.stringify({ action, ...values }) })
    const state = await api('/api/auth')
    await loadWorkspace(state.user)
  }

  const acceptInvite = async (values: { name: string; role: string; password: string; remember: boolean }) => {
    await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'acceptInvite', token: inviteToken(), ...values }) })
    clearInviteToken()
    const state = await api('/api/auth')
    await loadWorkspace(state.user)
  }

  const signOut = async () => {
    await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }).catch(() => null)
    setUser(null)
    setScreen('login')
  }

  if (screen === 'loading') return <StatusScreen icon={<LoaderCircle className="auth-spin" />} title="Opening CloseFlow" copy="Checking your secure session and loading the shared workspace." />
  if (screen === 'database') return <DatabaseSetup retry={bootstrap} />
  if (screen === 'error') return <StatusScreen icon={<AlertTriangle />} title="CloseFlow could not open" copy={message || 'The application could not connect to its backend.'} action={<button className="auth-submit" onClick={bootstrap}><RefreshCw />Try again</button>} />
  if (screen === 'invite' && invite) return <InviteScreen invite={invite} accept={acceptInvite} signIn={() => { clearInviteToken(); setScreen('login') }} />
  if (screen === 'setup' || screen === 'login') return <AuthScreen setup={screen === 'setup'} submit={authenticate} />

  const readOnly = user?.accessRole === 'viewer'
  return <AuthContext.Provider value={user}>
    {children}
    {!readOnly && <WorkspaceSync onState={setSyncState} />}
    <div className="auth-session">
      <div className="auth-session-avatar">{initials(user?.name || '')}</div>
      <div className="auth-session-meta"><strong>{user?.name}</strong><span>{user?.role}</span></div>
      {readOnly
        ? <div className="auth-sync"><i style={{ background: '#8b8bd6' }} />View only</div>
        : <div className={`auth-sync ${syncState}`}><i />{syncState === 'saving' ? 'Saving' : syncState === 'error' ? 'Sync issue' : 'Synced'}</div>}
      <button onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut /></button>
    </div>
  </AuthContext.Provider>
}

function WorkspaceSync({ onState }: { onState: (state: SyncState) => void }) {
  const lastSaved = useRef(localStorage.getItem(DATA_KEY) || JSON.stringify(emptyStore))
  const saving = useRef(false)

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const current = localStorage.getItem(DATA_KEY) || JSON.stringify(emptyStore)
      if (current === lastSaved.current || saving.current) return
      saving.current = true
      onState('saving')
      try {
        await api('/api/workspace', { method: 'PUT', body: current })
        lastSaved.current = current
        onState('synced')
      } catch {
        onState('error')
      } finally {
        saving.current = false
      }
    }, 900)
    return () => window.clearInterval(interval)
  }, [onState])
  return null
}

function AuthScreen({ setup, submit }: {
  setup: boolean
  submit: (action: 'signup' | 'login', values: { name?: string; email: string; role?: string; password: string; remember: boolean }) => Promise<void>
}) {
  const [form, setForm] = useState({ name: '', email: '', role: 'Project Coordinator', password: '', confirm: '', remember: true })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const set = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }))

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (setup && form.password.length < 8) return setError('Use at least 8 characters for your password.')
    if (setup && form.password !== form.confirm) return setError('The passwords do not match.')
    setSubmitting(true)
    try {
      await submit(setup ? 'signup' : 'login', form)
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-shell">
    <section className="auth-visual">
      <div className="auth-brand"><div className="auth-brand-mark">C</div><div><strong>CloseFlow</strong><span>Project closeout</span></div></div>
      <div className="auth-message"><span className="auth-kicker">One clear path to closure</span><h1>Keep every old project moving.</h1><p>Track invoices, missing documents, owners, due dates, and the next action required to close each project.</p></div>
      <div className="auth-security"><ShieldCheck /><div><strong>Shared database workspace</strong><span>Accounts and project records are stored securely in Neon Postgres.</span></div></div>
    </section>
    <section className="auth-form-panel">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-icon"><LockKeyhole /></div>
        <span className="auth-eyebrow">{setup ? 'Workspace setup' : 'Welcome back'}</span>
        <h2>{setup ? 'Create the administrator account' : 'Sign in to CloseFlow'}</h2>
        <p>{setup ? 'The first account becomes the owner of the shared CloseFlow workspace.' : 'Continue to your shared project closeout workspace.'}</p>
        {setup && <div className="auth-field-grid"><label>Full name<input required autoComplete="name" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Your full name" /></label><label>Role<input required value={form.role} onChange={(event) => set('role', event.target.value)} /></label></div>}
        <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="name@organization.com" /></label>
        <label>Password<div className="auth-password-field"><input required type={showPassword ? 'text' : 'password'} autoComplete={setup ? 'new-password' : 'current-password'} value={form.password} onChange={(event) => set('password', event.target.value)} placeholder={setup ? 'At least 8 characters' : 'Enter your password'} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
        {setup && <label>Confirm password<input required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirm} onChange={(event) => set('confirm', event.target.value)} placeholder="Enter the password again" /></label>}
        <label className="auth-remember"><input type="checkbox" checked={form.remember} onChange={(event) => set('remember', event.target.checked)} /><span>Keep me signed in on this device</span></label>
        {error && <div className="auth-error" role="alert"><AlertTriangle />{error}</div>}
        <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : setup ? 'Create workspace account' : 'Sign in'}</button>
        <small className="auth-note">Passwords are hashed server-side and sessions use secure, HTTP-only cookies.</small>
      </form>
    </section>
  </main>
}

function InviteScreen({ invite, accept, signIn }: {
  invite: Invite
  accept: (values: { name: string; role: string; password: string; remember: boolean }) => Promise<void>
  signIn: () => void
}) {
  const [form, setForm] = useState({ name: '', role: 'Project Coordinator', password: '', confirm: '', remember: true })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const set = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }))

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (form.password.length < 8) return setError('Use at least 8 characters for your password.')
    if (form.password !== form.confirm) return setError('The passwords do not match.')
    setSubmitting(true)
    try {
      await accept({ name: form.name, role: form.role, password: form.password, remember: form.remember })
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-shell">
    <section className="auth-visual">
      <div className="auth-brand"><div className="auth-brand-mark">C</div><div><strong>CloseFlow</strong><span>Project closeout</span></div></div>
      <div className="auth-message"><span className="auth-kicker">You have been invited</span><h1>Join {invite.teamName || invite.workspaceName}.</h1><p>{invite.invitedBy ? `${invite.invitedBy} invited you` : 'You have been invited'} to {invite.workspaceName}{invite.teamName ? ` as part of the ${invite.teamName} team` : ''}. Create your account to start working on closeouts together.</p></div>
      <div className="auth-security"><UsersRound /><div><strong>{invite.teamName || 'Workspace access'}</strong><span>Your invitation is for {invite.email}.</span></div></div>
    </section>
    <section className="auth-form-panel">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-icon"><UsersRound /></div>
        <span className="auth-eyebrow">Accept invitation</span>
        <h2>Create your account</h2>
        <p>Signing up with <b>{invite.email}</b>.</p>
        <div className="auth-field-grid"><label>Full name<input required autoComplete="name" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Your full name" /></label><label>Title<input required value={form.role} onChange={(event) => set('role', event.target.value)} /></label></div>
        <label>Password<div className="auth-password-field"><input required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(event) => set('password', event.target.value)} placeholder="At least 8 characters" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
        <label>Confirm password<input required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirm} onChange={(event) => set('confirm', event.target.value)} placeholder="Enter the password again" /></label>
        <label className="auth-remember"><input type="checkbox" checked={form.remember} onChange={(event) => set('remember', event.target.checked)} /><span>Keep me signed in on this device</span></label>
        {error && <div className="auth-error" role="alert"><AlertTriangle />{error}</div>}
        <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : 'Join the workspace'}</button>
        <button className="auth-link" type="button" onClick={signIn}>Already have an account? Sign in</button>
      </form>
    </section>
  </main>
}

function DatabaseSetup({ retry }: { retry: () => void }) {
  return <main className="auth-status-shell"><section className="database-card"><div className="auth-icon"><Database /></div><span className="auth-eyebrow">Database connection required</span><h1>Connect Neon to CloseFlow</h1><p>The application code is ready, but Vercel has not provided a Postgres connection string yet.</p><ol><li><b>Open Vercel</b><span>Select the CloseFlow project.</span></li><li><b>Add Neon</b><span>Go to Storage or Marketplace, choose Neon Postgres, and connect it to this project.</span></li><li><b>Redeploy</b><span>Vercel will add <code>POSTGRES_URL</code> automatically. Redeploy the latest commit if it does not start by itself.</span></li></ol><button className="auth-submit" onClick={retry}><RefreshCw />Retry database connection</button><small>Project and account records are stored through the connected Neon database.</small></section></main>
}

function StatusScreen({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action?: ReactNode }) {
  return <main className="auth-status-shell"><section className="status-card"><div className="auth-icon">{icon}</div><h1>{title}</h1><p>{copy}</p>{action}<div className="status-trust"><CheckCircle2 />Secure session and database checks enabled</div></section></main>
}
