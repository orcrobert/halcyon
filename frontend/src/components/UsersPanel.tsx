import { useEffect, useState } from 'react'
import { createUser, deleteUser, listUsers, updateUser } from '../api/admin'
import { getSettings } from '../api/settings'
import { extractErrors } from '../api/errors'
import { useAuth } from '../auth/context'
import { Card, Field, SwitchRow } from './AccountCard'
import { DecomposerCard } from './DecomposerCard'
import { GeneratorsCard } from './GeneratorsCard'
import { AVATAR_STYLE, PRIMARY_BUTTON_STYLE, initials } from './accountStyles'
import type { ManagedUser, ManagedUserUpdate, Settings } from '../types'

const MIN_PASSWORD = 8

const QUIET_BUTTON_CLASS =
  'flex items-center gap-2 rounded-xl border border-line bg-surface-sunken text-[13px] text-ink-soft hover:text-ink-bright hover:border-line-hover transition-colors disabled:opacity-50'
const QUIET_BUTTON_STYLE: React.CSSProperties = { padding: '9px 15px', fontFamily: 'inherit' }

function lastSeen(user: ManagedUser): string {
  if (!user.last_active_at) return 'Never signed in'
  return `Active ${new Date(user.last_active_at).toLocaleDateString()}`
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function Avatar({ user, size }: { user: ManagedUser; size: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl text-[12px] font-semibold text-accent-pale shrink-0"
      style={{ width: size, height: size, ...AVATAR_STYLE }}
    >
      {initials(user.name, user.email)}
    </div>
  )
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return <p role="alert" className="text-[12px] text-danger-bright leading-relaxed">{message}</p>
}

export function UsersPanel() {
  const { state } = useAuth()
  const meId = state.status === 'authed' ? state.user.id : null
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    listUsers()
      .then((list) => { if (!cancelled) setUsers(list) })
      .catch((e) => { if (!cancelled) setError(extractErrors(e).message) })
    return () => { cancelled = true }
  }, [])

  const selected = users?.find((u) => u.id === selectedId) ?? null

  function replace(next: ManagedUser) {
    setUsers((list) => (list ?? []).map((u) => (u.id === next.id ? next : u)))
  }

  if (selected) {
    return (
      <ManagedAccount
        key={selected.id}
        user={selected}
        isSelf={selected.id === meId}
        onBack={() => setSelectedId(null)}
        onChanged={replace}
        onDeleted={() => {
          setUsers((list) => (list ?? []).filter((u) => u.id !== selected.id))
          setSelectedId(null)
        }}
      />
    )
  }

  return (
    <>
      {creating && (
        <NewAccountCard
          onCancel={() => setCreating(false)}
          onCreated={(user) => {
            setUsers((list) => [...(list ?? []), user])
            setCreating(false)
            setSelectedId(user.id)
          }}
        />
      )}

      <Card title="Accounts" hint="Everyone who can sign in to this server. Open one to manage it.">
        {!creating && (
          <div className="flex">
            <button onClick={() => setCreating(true)} className={QUIET_BUTTON_CLASS} style={QUIET_BUTTON_STYLE}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New account
            </button>
          </div>
        )}

        <ErrorLine message={error} />

        {users === null && !error && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl animate-pulse" style={{ height: '58px', background: 'color-mix(in srgb, var(--color-wash) 2.2%, transparent)' }} />
            ))}
          </div>
        )}

        {users && (
          <ul className="flex flex-col gap-2">
            {users.map((user) => (
              <li key={user.id}>
                <button
                  onClick={() => setSelectedId(user.id)}
                  className="w-full flex items-center gap-3 rounded-xl border border-line bg-surface-sunken hover:border-line-hover transition-colors text-left"
                  style={{ padding: '11px 13px', fontFamily: 'inherit' }}
                >
                  <Avatar user={user} size={34} />
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] text-ink truncate">{user.name}</span>
                      {user.is_admin && (
                        <span className="text-[10px] uppercase tracking-[0.14em] text-accent-soft/80 shrink-0">Admin</span>
                      )}
                      {user.id === meId && (
                        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-faint shrink-0">You</span>
                      )}
                    </span>
                    <span className="text-[11.5px] text-ink-faint truncate" style={{ marginTop: '2px' }}>
                      {user.email}
                    </span>
                  </span>
                  <span className="hidden sm:flex flex-col items-end shrink-0 text-[11px] text-ink-faint">
                    <span>{plural(user.atmospheres, 'soundscape')}</span>
                    <span style={{ marginTop: '2px' }}>{lastSeen(user)}</span>
                  </span>
                  <svg className="text-ink-faint shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function NewAccountCard({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (user: ManagedUser) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = name.trim() !== '' && email.trim() !== '' && password.length >= MIN_PASSWORD

  async function handleCreate() {
    setSaving(true)
    setError(null)
    try {
      onCreated(await createUser({ name: name.trim(), email: email.trim(), password, is_admin: isAdmin }))
    } catch (e) {
      setError(extractErrors(e).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="New account"
      hint="Give the person their email and password. Once it exists you can add their keys and generator."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="halcyon-new-user-name" value={name} placeholder="Full name" onChange={setName} />
        <Field label="Email" name="halcyon-new-user-email" type="email" value={email} placeholder="name@example.com" onChange={setEmail} />
      </div>
      <Field
        label="Password"
        name="halcyon-new-user-password"
        type="password"
        value={password}
        placeholder={`At least ${MIN_PASSWORD} characters`}
        onChange={setPassword}
      />
      <SwitchRow
        on={isAdmin}
        onToggle={() => setIsAdmin((v) => !v)}
        label="Administrator"
        description="Can create, edit and delete every account on this server, including their keys and generators."
      />
      <ErrorLine message={error} />
      <div
        className="flex flex-wrap items-center justify-end gap-3"
        style={{ paddingTop: '16px', borderTop: '1px solid var(--color-line-soft)' }}
      >
        <button onClick={onCancel} className="text-[12.5px] text-ink-muted hover:text-ink-soft transition-colors" style={{ fontFamily: 'inherit' }}>
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={saving || !ready}
          className="text-[13px] font-medium text-wash rounded-xl transition disabled:opacity-50"
          style={PRIMARY_BUTTON_STYLE}
        >
          {saving ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </Card>
  )
}

function ManagedAccount({
  user,
  isSelf,
  onBack,
  onChanged,
  onDeleted,
}: {
  user: ManagedUser
  isSelf: boolean
  onBack: () => void
  onChanged: (user: ManagedUser) => void
  onDeleted: () => void
}) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  useEffect(() => {
    if (isSelf) return
    let cancelled = false
    getSettings(user.id)
      .then((next) => { if (!cancelled) setSettings(next) })
      .catch((e) => { if (!cancelled) setSettingsError(extractErrors(e).message) })
    return () => { cancelled = true }
  }, [user.id, isSelf])

  return (
    <>
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[12px] text-ink-muted hover:text-ink-soft transition-colors shrink-0"
          style={{ fontFamily: 'inherit' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          All accounts
        </button>
      </div>

      <div className="flex items-center gap-3 min-w-0" style={{ padding: '4px 2px' }}>
        <Avatar user={user} size={40} />
        <div className="flex flex-col min-w-0">
          <span className="text-[15px] font-semibold text-ink tracking-tight truncate">{user.name}</span>
          <span className="text-[11.5px] text-ink-faint truncate" style={{ marginTop: '2px' }}>
            {[user.email, plural(user.atmospheres, 'soundscape'), lastSeen(user)].join(' · ')}
          </span>
        </div>
      </div>

      <ProfileCard user={user} isSelf={isSelf} onChanged={onChanged} />

      {isSelf ? (
        <Card title="Your own settings" hint="This is your account. Its keys and generators live in the other sections of this page." />
      ) : (
        <>
          <ErrorLine message={settingsError} />
          {settings && (
            <DecomposerCard
              settings={settings}
              onSaved={setSettings}
              userId={user.id}
              hint={`The language model that splits ${user.name}'s prompts into layers. Leave the key empty to use this server's default.`}
            />
          )}
          <GeneratorsCard userId={user.id} />
          <DeleteCard user={user} onDeleted={onDeleted} />
        </>
      )}
    </>
  )
}

function ProfileCard({
  user,
  isSelf,
  onChanged,
}: {
  user: ManagedUser
  isSelf: boolean
  onChanged: (user: ManagedUser) => void
}) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const patch: ManagedUserUpdate = {}
  if (name.trim() && name.trim() !== user.name) patch.name = name.trim()
  if (email.trim() && email.trim().toLowerCase() !== user.email) patch.email = email.trim()
  if (password) patch.password = password
  const dirty = Object.keys(patch).length > 0
  const passwordShort = password !== '' && password.length < MIN_PASSWORD

  async function apply(change: ManagedUserUpdate, message: string) {
    setSaving(true)
    setError(null)
    setSaved(null)
    try {
      const next = await updateUser(user.id, change)
      onChanged(next)
      setName(next.name)
      setEmail(next.email)
      setPassword('')
      setSaved(message)
    } catch (e) {
      setError(extractErrors(e).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Profile" hint="How they sign in. Setting a new password signs them out on every device.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="halcyon-managed-name" value={name} placeholder={user.name} onChange={setName} />
        <Field label="Email" name="halcyon-managed-email" type="email" value={email} placeholder={user.email} onChange={setEmail} />
      </div>
      <Field
        label="New password"
        name="halcyon-managed-password"
        type="password"
        value={password}
        placeholder="Leave blank to keep the current one"
        onChange={setPassword}
      />
      <SwitchRow
        on={user.is_admin}
        onToggle={() => {
          if (isSelf || saving) return
          void apply({ is_admin: !user.is_admin }, user.is_admin ? 'Admin access removed' : 'Now an administrator')
        }}
        label="Administrator"
        description={
          isSelf
            ? 'You cannot remove your own admin access. Another administrator can.'
            : 'Can create, edit and delete every account on this server, including their keys and generators.'
        }
      />
      <ErrorLine message={passwordShort ? `Passwords need at least ${MIN_PASSWORD} characters.` : error} />
      <div
        className="flex flex-wrap items-center justify-end gap-3"
        style={{ paddingTop: '16px', borderTop: '1px solid var(--color-line-soft)' }}
      >
        <span className="text-[11.5px] text-ink-faint flex-1">{dirty ? 'Unsaved changes' : saved ?? ''}</span>
        <button
          onClick={() => void apply(patch, 'All changes saved')}
          disabled={saving || !dirty || passwordShort}
          className="text-[13px] font-medium text-wash rounded-xl transition disabled:opacity-50"
          style={PRIMARY_BUTTON_STYLE}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Card>
  )
}

function DeleteCard({ user, onDeleted }: { user: ManagedUser; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteUser(user.id)
      onDeleted()
    } catch (e) {
      setError(extractErrors(e).message)
      setDeleting(false)
    }
  }

  return (
    <Card
      title="Delete account"
      hint={`Removes ${user.name}, their ${plural(user.atmospheres, 'soundscape')} and every saved key and generator. This cannot be undone.`}
    >
      <ErrorLine message={error} />
      <div className="flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl text-[13px] font-medium text-danger-bright bg-surface-danger border border-danger/50 transition disabled:opacity-50"
              style={QUIET_BUTTON_STYLE}
            >
              {deleting ? 'Deleting…' : `Delete ${user.name}`}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="text-[12.5px] text-ink-muted hover:text-ink-soft transition-colors"
              style={{ fontFamily: 'inherit' }}
            >
              Keep account
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface-sunken text-[13px] text-ink-soft hover:text-danger-bright hover:border-danger/50 transition-colors"
            style={QUIET_BUTTON_STYLE}
          >
            Delete account
          </button>
        )}
      </div>
    </Card>
  )
}
