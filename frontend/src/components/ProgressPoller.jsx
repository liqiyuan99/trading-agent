import { useEffect, useRef, useState } from 'react'

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function ProgressPoller({ runId, onComplete }) {
  const [status, setStatus] = useState(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!runId) return

    async function poll() {
      try {
        const res = await fetch(`/api/runs/${runId}/status`)
        const data = await res.json()
        setStatus(data)
        if (data.status === 'complete' || data.status === 'failed') {
          clearInterval(intervalRef.current)
          onComplete?.(data)
        }
      } catch {
        // network hiccup — keep polling
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 5000)
    return () => clearInterval(intervalRef.current)
  }, [runId])

  if (!status || status.status === 'complete' || status.status === 'failed') return null

  if (status.is_stale) {
    return (
      <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
        <span className="text-yellow-500 text-xl shrink-0">⚠️</span>
        <div>
          <p className="font-medium text-yellow-800 text-sm">Run may be stale</p>
          <p className="text-sm text-yellow-700 mt-0.5">
            Active for over 30 minutes. The Gemini API may be slow or rate-limited.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
      <Spinner />
      <p className="text-blue-800 text-sm">{status.progress_message ?? 'Analysis in progress…'}</p>
    </div>
  )
}
