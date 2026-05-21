import { useEffect, useState } from 'react'

const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly']

const FREQ_LABEL = {
  daily:    'Daily',
  weekly:   'Weekly (Mon)',
  biweekly: 'Bi-weekly (Mon)',
  monthly:  'Monthly (1st)',
}

function Badge({ active }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
      active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
    }`}>
      {active ? 'Active' : 'Paused'}
    </span>
  )
}

function RecipientsEditor({ initial, onSave, onCancel }) {
  const [value, setValue] = useState(initial.join('\n'))

  function handleSave() {
    const emails = value.split('\n').map(e => e.trim()).filter(Boolean)
    onSave(emails)
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        rows={Math.max(2, initial.length + 1)}
        placeholder="one@example.com&#10;two@example.com"
        value={value}
        onChange={e => setValue(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="px-3 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 font-medium"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-gray-500 text-xs rounded-md hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function ScheduleRow({ schedule, onToggle, onUpdateRecipients, onDelete }) {
  const [editingRecipients, setEditingRecipients] = useState(false)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    await onToggle(schedule.id, !schedule.is_active)
    setBusy(false)
  }

  async function saveRecipients(emails) {
    setBusy(true)
    await onUpdateRecipients(schedule.id, emails)
    setEditingRecipients(false)
    setBusy(false)
  }

  const nextRun = schedule.next_run_at
    ? new Date(schedule.next_run_at).toLocaleString()
    : '—'

  return (
    <div className="px-6 py-4 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono font-semibold text-gray-900 mr-2">{schedule.ticker}</span>
          <span className="text-sm text-gray-500 mr-2">{FREQ_LABEL[schedule.frequency]}</span>
          <Badge active={schedule.is_active} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggle}
            disabled={busy}
            className="text-xs px-2.5 py-1 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            {schedule.is_active ? 'Pause' : 'Resume'}
          </button>
          <button
            onClick={() => onDelete(schedule.id)}
            disabled={busy}
            className="text-xs px-2.5 py-1 border border-red-200 rounded-md text-red-500 hover:bg-red-50 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-400">
        Next run: {nextRun}
        {schedule.last_run_at && (
          <> · Last run: {new Date(schedule.last_run_at).toLocaleString()}</>
        )}
      </div>

      <div className="text-xs text-gray-500 flex items-center gap-1">
        <span>Recipients: {schedule.recipients.length === 0 ? 'none' : schedule.recipients.join(', ')}</span>
        <button
          onClick={() => setEditingRecipients(v => !v)}
          className="underline hover:text-blue-600 ml-1"
        >
          {editingRecipients ? 'cancel' : 'edit'}
        </button>
      </div>

      {editingRecipients && (
        <RecipientsEditor
          initial={schedule.recipients}
          onSave={saveRecipients}
          onCancel={() => setEditingRecipients(false)}
        />
      )}
    </div>
  )
}

export function Schedules() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // new-schedule form state
  const [ticker, setTicker] = useState('')
  const [frequency, setFrequency] = useState('weekly')
  const [recipients, setRecipients] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState(null)

  async function load() {
    try {
      const data = await fetch('/api/schedules').then(r => r.json())
      setSchedules(data)
    } catch {
      setError('Could not load schedules — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setFormError(null)
    setCreating(true)
    try {
      const emailList = recipients.split('\n').map(r => r.trim()).filter(Boolean)
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, frequency, recipients: emailList }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = Array.isArray(data.detail) ? data.detail[0]?.msg : (data.detail ?? 'Failed')
        throw new Error(msg)
      }
      setSchedules(prev => [data, ...prev])
      setTicker('')
      setRecipients('')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleToggle(id, isActive) {
    const res = await fetch(`/api/schedules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSchedules(prev => prev.map(s => s.id === id ? updated : s))
    }
  }

  async function handleUpdateRecipients(id, emails) {
    const res = await fetch(`/api/schedules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: emails }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSchedules(prev => prev.map(s => s.id === id ? updated : s))
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this schedule?')) return
    const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' })
    if (res.ok) setSchedules(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Scheduled Runs</h1>

      {/* New schedule form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add Schedule</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Ticker</label>
              <input
                type="text"
                required
                maxLength={5}
                placeholder="NVDA"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                disabled={creating}
                className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Frequency</label>
              <select
                value={frequency}
                onChange={e => setFrequency(e.target.value)}
                disabled={creating}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              >
                {FREQUENCIES.map(f => (
                  <option key={f} value={f}>{FREQ_LABEL[f]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Email recipients <span className="text-gray-400">(one per line, optional)</span>
            </label>
            <textarea
              placeholder="you@example.com"
              value={recipients}
              onChange={e => setRecipients(e.target.value)}
              disabled={creating}
              rows={2}
              className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 resize-none"
            />
          </div>

          {formError && (
            <p className="text-xs text-red-600">{formError}</p>
          )}

          <button
            type="submit"
            disabled={creating || !ticker}
            className="w-full bg-blue-600 text-white rounded-md py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Creating…' : 'Create Schedule'}
          </button>
        </form>
      </div>

      {/* Schedule list */}
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {loading && (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">Loading…</div>
        )}
        {error && (
          <div className="px-6 py-4 text-sm text-red-600">{error}</div>
        )}
        {!loading && !error && schedules.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            No schedules yet. Add one above.
          </div>
        )}
        {schedules.map(s => (
          <ScheduleRow
            key={s.id}
            schedule={s}
            onToggle={handleToggle}
            onUpdateRecipients={handleUpdateRecipients}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <p className="mt-4 text-xs text-gray-400 leading-relaxed">
        Scheduled runs fire at the hour set by <code className="bg-gray-100 px-1 rounded">SCHEDULE_RUN_HOUR</code> in
        your <code className="bg-gray-100 px-1 rounded">.env</code>.
        Email delivery requires SMTP credentials to be configured.
      </p>
    </div>
  )
}
