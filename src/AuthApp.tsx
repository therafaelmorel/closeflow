import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, Building2, CheckCircle2, Database, Eye, EyeOff, LoaderCircle, LockKeyhole, LogOut, RefreshCw, ShieldCheck, UserPlus, UsersRound } from 'lucide-react'
import { AuthContext, type CurrentUser } from './auth-context'
import { api } from './api'
import './auth.css'

type AuthUser = CurrentUser
type Store = { projects: unknown[]; items: unknown[]; invoices: unknown[]; activities: unknown[] }
type Screen = 'loading' | 'database' | 'auth' | 'invite' | 'join' | 'app' | 'error'
type SyncState = 'synced' | 'saving' | 'error'
type AuthMode = 'signup' | 'login'
type Invite = { email: string; accessRole: string; workspaceName: string; teamName: string; invitedBy: string; hasAccount: boolean }

type AuthAppProps = { children: ReactNode }

declare global {
  interface Window { __closeflowReadOnly?: boolean }
}

const DATA_KEY = 'closeflow-v1'
const emptyStore: Store = { projects: [], items: [], invoices: [], activities: [] }
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CF'
const inviteToken = () => new URLSearchParams(window.location.search).get('invite') || ''
const clearInviteToken = () => window.history.replaceState({}, '', window.location.pathname)

/** Reads the invitation in the address bar, if there is a valid one. */
const readInvite = async (): Promise<Invite | null> => {
  const token = inviteToken()
  if (!token) return null
  try {
    return await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'inviteInfo', token }) }) as Invite
  } catch {
    clearInviteToken()
    return null
  }
}

export default function AuthApp({ children }: AuthAppProps) {
  const [screen, setScreen] = useState<Screen>('loading')
  const [mode, setMode] = useState<AuthMode>('login')
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

  /** Reads the signed-in account back from the server and opens its active workspace. */
  const openSession = useCallback(async () => {
    const state = await api('/api/auth')
    if (!state.user) throw new Error('Your account could not be opened. Please try again.')
    await loadWorkspace(state.user)
  }, [loadWorkspace])

  const bootstrap = useCallback(async () => {
    setScreen('loading')
    setMessage('')
    try {
      const state = await api('/api/auth')
      const pending = await readInvite()
      setInvite(pending)

      // Someone who is already signed in confirms the invitation instead of creating a second account.
      if (state.authenticated && state.user) {
        if (pending) { setUser(state.user); setScreen('join'); return }
        await loadWorkspace(state.user)
        return
      }
      // An invitee without an account creates one; an invitee who has one signs in and joins.
      if (pending && !pending.hasAccount) { setScreen('invite'); return }
      setMode(pending || !state.setupRequired ? 'login' : 'signup')
      setScreen('auth')
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
    const token = inviteToken()
    await api('/api/auth', { method: 'POST', body: JSON.stringify({ action, token, ...values }) })
    // Signing in from an invitation link applies the invitation to the account that just signed in.
    if (token && action === 'login') {
      const joined = await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'joinInvite', token }) }).then(() => true).catch(() => false)
      if (!joined) {
        // Usually the invitation was addressed to a different account. Explain it rather than
        // dropping the invitation silently now that they are signed in.
        const state = await api('/api/auth')
        if (state.user) { setUser(state.user); setScreen('join'); return }
      }
    }
    if (token) clearInviteToken()
    await openSession()
  }

  const acceptInvite = async (values: { name: string; role: string; password: string; remember: boolean }) => {
    await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'acceptInvite', token: inviteToken(), ...values }) })
    clearInviteToken()
    await openSession()
  }

  const joinInvite = async () => {
    await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'joinInvite', token: inviteToken() }) })
    clearInviteToken()
    await openSession()
  }

  const switchWorkspace = async (workspaceId: string) => {
    if (workspaceId === user?.workspaceId) return
    setScreen('loading')
    try {
      await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'switchWorkspace', workspaceId }) })
      await openSession()
    } catch (error) {
      setMessage((error as Error).message)
      setScreen('error')
    }
  }

  const signOut = async () => {
    await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }).catch(() => null)
    setUser(null)
    setMode('login')
    setScreen('auth')
  }

  if (screen === 'loading') return <StatusScreen icon={<LoaderCircle className="auth-spin" />} title="Opening CloseFlow" copy="Checking your secure session and loading your workspace." />
  if (screen === 'database') return <DatabaseSetup retry={bootstrap} />
  if (screen === 'error') return <StatusScreen icon={<AlertTriangle />} title="CloseFlow could not open" copy={message || 'The application could not connect to its backend.'} action={<button className="auth-submit" onClick={bootstrap}><RefreshCw />Try again</button>} />
  // Signing in keeps the token so the invitation is applied to the account that signs in.
  if (screen === 'invite' && invite) return <InviteScreen invite={invite} accept={acceptInvite} signIn={() => { setMode('login'); setScreen('auth') }} />
  if (screen === 'join' && invite && user) return <JoinScreen invite={invite} email={user.email} join={joinInvite} skip={() => { clearInviteToken(); setInvite(null); void loadWorkspace(user) }} signOut={signOut} />
  if (screen === 'auth') return <AuthScreen mode={mode} setMode={setMode} invite={invite} submit={authenticate} />

  const readOnly = user?.accessRole === 'viewer'
  const workspaces = user?.workspaces || []
  // Keying on the workspace remounts the app and the sync loop on a switch, so one workspace's
  // records can never be written into another.
  return <AuthContext.Provider value={user} key={user?.workspaceId}>
    {children}
    {!readOnly && <WorkspaceSync onState={setSyncState} />}
    <div className="auth-session">
      <div className="auth-session-top">
        <div className="auth-session-avatar">{initials(user?.name || '')}</div>
        <div className="auth-session-meta"><strong>{user?.name}</strong><span>{user?.role}</span></div>
        <button onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut /></button>
      </div>
      <div className="auth-session-workspace">
        <Building2 />
        {workspaces.length > 1
          ? <select value={user?.workspaceId} onChange={(event) => void switchWorkspace(event.target.value)} aria-label="Active workspace">
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          : <span title={user?.workspaceName}>{user?.workspaceName}</span>}
      </div>
      <div className="auth-session-foot">
        {readOnly
          ? <div className="auth-sync"><i style={{ background: '#8b8bd6' }} />View only</div>
          : <div className={`auth-sync ${syncState}`}><i />{syncState === 'saving' ? 'Saving' : syncState === 'error' ? 'Sync issue' : 'Synced'}</div>}
      </div>
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

function AuthScreen({ mode, setMode, invite, submit }: {
  mode: AuthMode
  setMode: (mode: AuthMode) => void
  invite: Invite | null
  submit: (action: 'signup' | 'login', values: { name?: string; email: string; role?: string; password: string; remember: boolean }) => Promise<void>
}) {
  const signup = mode === 'signup'
  const [form, setForm] = useState({ name: '', email: invite?.email || '', role: 'Project Coordinator', password: '', confirm: '', remember: true })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const set = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }))

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (signup && form.password.length < 8) return setError('Use at least 8 characters for your password.')
    if (signup && form.password !== form.confirm) return setError('The passwords do not match.')
    setSubmitting(true)
    try {
      await submit(signup ? 'signup' : 'login', form)
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const swap = (next: AuthMode) => { setError(''); setMode(next) }

  return <main className="auth-shell">
    <section className="auth-visual">
      <div className="auth-brand"><div className="auth-brand-mark">C</div><div><strong>CloseFlow</strong><span>Project closeout</span></div></div>
      <div className="auth-message"><span className="auth-kicker">One clear path to closure</span><h1>Keep every old project moving.</h1><p>Track invoices, missing documents, owners, due dates, and the next action required to close each project.</p></div>
      <div className="auth-security"><ShieldCheck /><div><strong>Your account, your workspace</strong><span>Create an account, build your teams, and invite the people you close projects with.</span></div></div>
    </section>
    <section className="auth-form-panel">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-icon">{signup ? <UserPlus /> : <LockKeyhole />}</div>
        <span className="auth-eyebrow">{signup ? 'Create your account' : 'Welcome back'}</span>
        <h2>{signup ? 'Get started with CloseFlow' : 'Sign in to CloseFlow'}</h2>
        <p>{signup
          ? 'Your account comes with a workspace of your own. Invite people into your teams, or accept an invitation into theirs.'
          : 'Continue to your project closeout workspaces.'}</p>
        {invite && <div className="auth-invite-note"><UsersRound /><span>{invite.invitedBy ? `${invite.invitedBy} invited you` : 'You were invited'} to {invite.teamName || invite.workspaceName}. Sign in as <b>{invite.email}</b> and it will be added to your account.</span></div>}
        {signup && <div className="auth-field-grid"><label>Full name<input required autoComplete="name" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Your full name" /></label><label>Job title<input required value={form.role} onChange={(event) => set('role', event.target.value)} /></label></div>}
        <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="name@organization.com" /></label>
        <label>Password<div className="auth-password-field"><input required type={showPassword ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} value={form.password} onChange={(event) => set('password', event.target.value)} placeholder={signup ? 'At least 8 characters' : 'Enter your password'} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
        {signup && <label>Confirm password<input required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirm} onChange={(event) => set('confirm', event.target.value)} placeholder="Enter the password again" /></label>}
        <label className="auth-remember"><input type="checkbox" checked={form.remember} onChange={(event) => set('remember', event.target.checked)} /><span>Keep me signed in on this device</span></label>
        {error && <div className="auth-error" role="alert"><AlertTriangle />{error}</div>}
        <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : signup ? 'Create my account' : 'Sign in'}</button>
        <button className="auth-link" type="button" onClick={() => swap(signup ? 'login' : 'signup')}>
          {signup ? 'Already have an account? Sign in' : 'New to CloseFlow? Create an account'}
        </button>
        <small className="auth-note">Passwords are hashed server-side and sessions use secure, HTTP-only cookies.</small>
      </form>
    </section>
  </main>
}

function JoinScreen({ invite, email, join, skip, signOut }: {
  invite: Invite
  email: string
  join: () => Promise<void>
  skip: () => void
  signOut: () => Promise<void>
}) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const mismatch = invite.email.toLowerCase() !== email.toLowerCase()

  const accept = async () => {
    setError('')
    setSubmitting(true)
    try {
      await join()
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-shell">
    <section className="auth-visual">
      <div className="auth-brand"><div className="auth-brand-mark">C</div><div><strong>CloseFlow</strong><span>Project closeout</span></div></div>
      <div className="auth-message"><span className="auth-kicker">You have been invited</span><h1>Join {invite.teamName || invite.workspaceName}.</h1><p>{invite.invitedBy ? `${invite.invitedBy} invited you` : 'You have been invited'} to {invite.workspaceName}{invite.teamName ? ` as part of the ${invite.teamName} team` : ''}. Accepting adds it to the account you are already signed in with.</p></div>
      <div className="auth-security"><UsersRound /><div><strong>{invite.teamName || 'Workspace access'}</strong><span>You keep your own workspace and can switch between them at any time.</span></div></div>
    </section>
    <section className="auth-form-panel">
      <div className="auth-card">
        <div className="auth-icon"><UsersRound /></div>
        <span className="auth-eyebrow">Accept invitation</span>
        <h2>Join {invite.workspaceName}</h2>
        <p>Signed in as <b>{email}</b>.</p>
        {mismatch
          ? <div className="auth-error" role="alert"><AlertTriangle />This invitation was sent to {invite.email}. Sign out and sign in with that account to accept it.</div>
          : error && <div className="auth-error" role="alert"><AlertTriangle />{error}</div>}
        {!mismatch && <button className="auth-submit" type="button" onClick={() => void accept()} disabled={submitting}>{submitting ? 'Please wait…' : `Join ${invite.workspaceName}`}</button>}
        {mismatch
          ? <button className="auth-submit" type="button" onClick={() => void signOut()}>Sign out</button>
          : <button className="auth-link" type="button" onClick={skip}>Not now, take me to my workspace</button>}
      </div>
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
