import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProgressPoller } from '../components/ProgressPoller.jsx'
import { RecommendationBadge } from '../components/RecommendationBadge.jsx'

function todayMinus(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

export function NewAnalysis() {
  const [ticker, setTicker] = useState('')
  const [analysisDate, setAnalysisDate] = useState(todayMinus(3))
  const [activeRunId, setActiveRunId] = useState(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [warning, setWarning] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const today = new Date().toISOString().split('T')[0]

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setResult(null)
    setWarning(null)
    setRunning(true)
    setActiveRunId(null)

    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, analysis_date: analysisDate }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = Array.isArray(data.detail)
          ? data.detail[0]?.msg
          : (data.detail ?? 'Failed to start run')
        throw new Error(msg)
      }
      if (data.warning) setWarning(data.warning)
      setActiveRunId(data.run_id)
    } catch (err) {
      setError(err.message)
      setRunning(false)
    }
  }

  async function handleComplete(status) {
    setRunning(false)
    const run = await fetch(`/api/runs/${activeRunId}`).then(r => r.json())
    if (status.status === 'failed') {
      setError(run.error_message ?? 'Analysis failed')
    } else {
      setResult(run)
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Analysis</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ticker symbol</label>
          <input
            type="text"
            required
            maxLength={5}
            placeholder="NVDA"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            disabled={running}
            className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Analysis date</label>
          <input
            type="date"
            required
            max={today}
            value={analysisDate}
            onChange={e => setAnalysisDate(e.target.value)}
            disabled={running}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <p className="text-xs text-gray-400 mt-1">
            Defaults to 3 days before today. Avoid weekends — use the most recent Friday if needed.
          </p>
        </div>

        <button
          type="submit"
          disabled={running || !ticker}
          className="w-full bg-blue-600 text-white rounded-md py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {running ? 'Analyzing…' : 'Run Analysis'}
        </button>

        {!running && (
          <p className="text-xs text-center text-gray-400">
            Each run generates both English and Chinese reports automatically.
          </p>
        )}
      </form>

      {warning && (
        <div className="mt-3 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
          {warning}
        </div>
      )}

      {error && (
        <div className="mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button
            onClick={() => { setError(null); setActiveRunId(null) }}
            className="shrink-0 underline font-medium"
          >
            Try again
          </button>
        </div>
      )}

      {activeRunId && running && (
        <ProgressPoller runId={activeRunId} onComplete={handleComplete} />
      )}

      {result && (
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900">{result.ticker}</span>
              <span className="text-gray-400 text-sm">{result.analysis_date}</span>
            </div>
            <RecommendationBadge value={result.recommendation} />
          </div>
          {result.final_report && (
            <p className="text-gray-600 text-sm leading-relaxed">
              {result.final_report.replace(/\*\*/g, '').slice(0, 400)}
              {result.final_report.length > 400 ? '…' : ''}
            </p>
          )}
          <button
            onClick={() => navigate(`/runs/${result.id}`)}
            className="mt-4 text-sm text-blue-600 font-medium hover:underline"
          >
            View full report →
          </button>
        </div>
      )}
    </div>
  )
}
