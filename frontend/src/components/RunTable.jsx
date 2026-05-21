import { useNavigate } from 'react-router-dom'
import { RecommendationBadge } from './RecommendationBadge.jsx'

const STATUS_COLORS = {
  complete:  'text-green-600',
  failed:    'text-red-500',
  running:   'text-blue-500',
  pending:   'text-gray-400',
}

export function RunTable({ runs, onDelete }) {
  const navigate = useNavigate()

  if (runs.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg">No runs yet.</p>
        <p className="text-sm mt-1">Run your first analysis to see it here.</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {['Ticker', 'Analysis Date', 'Run Date', 'Status', 'Recommendation', 'Actions'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {runs.map(run => (
            <tr
              key={run.id}
              className="hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => navigate(`/runs/${run.id}`)}
            >
              <td className="px-4 py-3 font-semibold text-gray-900">{run.ticker}</td>
              <td className="px-4 py-3 text-gray-600">{run.analysis_date}</td>
              <td className="px-4 py-3 text-gray-500">
                {new Date(run.run_timestamp + 'Z').toLocaleString()}
              </td>
              <td className={`px-4 py-3 font-medium capitalize ${STATUS_COLORS[run.status] ?? 'text-gray-500'}`}>
                {run.status}
              </td>
              <td className="px-4 py-3">
                <RecommendationBadge value={run.recommendation} />
              </td>
              <td className="px-4 py-3">
                <button
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                  onClick={e => { e.stopPropagation(); onDelete(run.id) }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
