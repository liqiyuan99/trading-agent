import { useEffect, useState } from 'react'
import { RunTable } from '../components/RunTable.jsx'

export function History() {
  const [runs, setRuns] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  async function load(ticker = '') {
    setLoading(true)
    const params = new URLSearchParams({ limit: '100' })
    if (ticker) params.set('ticker', ticker)
    try {
      const data = await fetch(`/api/runs?${params}`).then(r => r.json())
      setRuns(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleFilterChange(e) {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '')
    setFilter(val)
    load(val)
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this run? This cannot be undone.')) return
    await fetch(`/api/runs/${id}`, { method: 'DELETE' })
    setRuns(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">History</h1>
        <input
          type="text"
          placeholder="Filter by ticker…"
          value={filter}
          onChange={handleFilterChange}
          maxLength={5}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <p className="text-gray-400 text-center py-12">Loading…</p>
      ) : (
        <RunTable runs={runs} onDelete={handleDelete} />
      )}
    </div>
  )
}
