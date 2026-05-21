import { useEffect, useState } from 'react'

function Row({ label, value }) {
  return (
    <div className="px-6 py-4 flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 font-mono">{value}</span>
    </div>
  )
}

export function Settings() {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(setSettings)
      .catch(() => setError('Could not load settings — is the backend running?'))
  }, [])

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {settings ? (
          <>
            <Row label="Deep think model" value={settings.deep_think_model} />
            <Row label="Quick think model" value={settings.quick_think_model} />
            <Row label="Default date offset" value={`${settings.default_date_offset_days} days before today`} />
            <Row label="Analysis timeout" value={`${settings.analysis_timeout_minutes} minutes`} />
            <Row label="Schedule timezone" value={settings.schedule_timezone} />
            <Row label="Schedule run hour" value={`${settings.schedule_run_hour}:00`} />
            <div className="px-6 py-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">Email delivery</span>
              <span className={`text-sm font-medium ${settings.email_configured ? 'text-green-600' : 'text-gray-400'}`}>
                {settings.email_configured ? 'Configured' : 'Not configured'}
              </span>
            </div>
          </>
        ) : !error ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : null}

        <div className="px-6 py-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">Gemini API Console</span>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Open ↗
          </a>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-400 leading-relaxed">
        Models and offsets are configured in your <code className="bg-gray-100 px-1 rounded">.env</code> file.
        Restart the backend server to apply any changes.
      </p>
    </div>
  )
}
