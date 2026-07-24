import { useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, Eye, EyeOff, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react'
import './auth.css'

type AuthUser = { name: string; email: string; role: string }
type StoredAccount = AuthUser & { salt: string; passwordHash: string }

type AuthAppProps = { children: ReactNode }

const ACCOUNT_KEY = 'closeflow-account-v1'
const SESSION_KEY = 'closeflow-session-v1'

const readJSON = <T,>(key: string, storage: Storage = localStorage): T | null => {
  try {
    return JSON.parse(storage.getItem(key) || 'null') as T | null
  } catch {
    return null
  }
}

const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
const makeSalt = () => toBase64(crypto.getRandomValues(new Uint8Array(16)))
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CF'

const derivePassword = async (password: string, salt: string) => {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const saltBytes = fromBase64(salt)
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 120_000,
    },
    material,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

export default function AuthApp({ children }: AuthAppProps) {
  const [account, setAccount] = useState<StoredAccount | null>(() => readJSON<StoredAccount>(ACCOUNT_KEY))
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (!readJSON<StoredAccount>(ACCOUNT_KEY)) return null
    return readJSON<AuthUser>(SESSION_KEY, localStorage) || readJSON<AuthUser>(SESSION_KEY, sessionStorage)
  })

  const saveSession = (nextUser: AuthUser, remember: boolean) => {
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    const storage = remember ? localStorage : sessionStorage
    storage.setItem(SESSION_KEY, JSON.stringify(nextUser))
    setUser(nextUser)
  }

  const createAccount = async (profile: AuthUser, password: string, remember: boolean) => {
    const salt = makeSalt()
    const nextAccount: StoredAccount = {
      ...profile,
      salt,
      passwordHash: await derivePassword(password, salt),
    }
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(nextAccount))
    setAccount(nextAccount)
    saveSession(profile, remember)
  }

  const signIn = async (email: string, password: string, remember: boolean) => {
    if (!account || account.email.toLowerCase() !== email.trim().toLowerCase()) {
      return 'The email or password is incorrect.'
    }
    const passwordHash = await derivePassword(password, account.salt)
    if (passwordHash !== account.passwordHash) return 'The email or password is incorrect.'
    saveSession({ name: account.name, email: account.email, role: account.role }, remember)
    return null
  }

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  const resetAccount = () => {
    localStorage.removeItem(ACCOUNT_KEY)
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    setAccount(null)
    setUser(null)
  }

  if (!user) {
    return <AuthScreen account={account} createAccount={createAccount} signIn={signIn} resetAccount={resetAccount} />
  }

  return <>
    {children}
    <div className="auth-session">
      <div className="auth-session-avatar">{initials(user.name)}</div>
      <div className="auth-session-meta"><strong>{user.name}</strong><span>{user.role}</span></div>
      <button onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut /></button>
    </div>
  </>
}

function AuthScreen({ account, createAccount, signIn, resetAccount }: {
  account: StoredAccount | null
  createAccount: (profile: AuthUser, password: string, remember: boolean) => Promise<void>
  signIn: (email: string, password: string, remember: boolean) => Promise<string | null>
  resetAccount: () => void
}) {
  const setup = !account
  const [form, setForm] = useState({
    name: '',
    email: account?.email || '',
    role: 'Project Coordinator',
    password: '',
    confirm: '',
    remember: true,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const set = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (setup && form.password.length < 8) {
      setError('Use at least 8 characters for your password.')
      return
    }
    if (setup && form.password !== form.confirm) {
      setError('The passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      if (setup) {
        await createAccount(
          {
            name: form.name.trim(),
            email: form.email.trim(),
            role: form.role.trim() || 'Project Coordinator',
          },
          form.password,
          form.remember,
        )
      } else {
        const nextError = await signIn(form.email, form.password, form.remember)
        if (nextError) setError(nextError)
      }
    } catch {
      setError('CloseFlow could not complete sign-in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-shell">
    <section className="auth-visual">
      <div className="auth-brand"><div className="auth-brand-mark">C</div><div><strong>CloseFlow</strong><span>Project closeout</span></div></div>
      <div className="auth-message">
        <span className="auth-kicker">One clear path to closure</span>
        <h1>Keep every old project moving.</h1>
        <p>Track invoices, missing documents, owners, due dates, and the next action required to close each project.</p>
      </div>
      <div className="auth-security"><ShieldCheck /><div><strong>Private local workspace</strong><span>Your account and project records stay in this browser.</span></div></div>
    </section>
    <section className="auth-form-panel">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-icon"><LockKeyhole /></div>
        <span className="auth-eyebrow">{setup ? 'First-time setup' : 'Welcome back'}</span>
        <h2>{setup ? 'Create your workspace account' : 'Sign in to CloseFlow'}</h2>
        <p>{setup ? 'Set up the account that will protect this CloseFlow workspace.' : `Continue to the project closeout workspace for ${account?.email}.`}</p>

        {setup && <div className="auth-field-grid">
          <label>Full name<input required autoComplete="name" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Your full name" /></label>
          <label>Role<input required value={form.role} onChange={(event) => set('role', event.target.value)} placeholder="Project Coordinator" /></label>
        </div>}

        <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="name@organization.com" /></label>
        <label>Password<div className="auth-password-field"><input required type={showPassword ? 'text' : 'password'} autoComplete={setup ? 'new-password' : 'current-password'} value={form.password} onChange={(event) => set('password', event.target.value)} placeholder={setup ? 'At least 8 characters' : 'Enter your password'} /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
        {setup && <label>Confirm password<input required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirm} onChange={(event) => set('confirm', event.target.value)} placeholder="Enter the password again" /></label>}
        <label className="auth-remember"><input type="checkbox" checked={form.remember} onChange={(event) => set('remember', event.target.checked)} /><span>Keep me signed in on this device</span></label>
        {error && <div className="auth-error" role="alert"><AlertTriangle />{error}</div>}
        <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : setup ? 'Create account' : 'Sign in'}</button>
        {!setup && <button className="auth-reset" type="button" onClick={() => { if (confirm('Reset the local CloseFlow account? Project records will remain in this browser.')) resetAccount() }}>Reset local account</button>}
        <small className="auth-note">This login protects the current browser workspace. Shared team accounts will require a connected authentication database.</small>
      </form>
    </section>
  </main>
}
