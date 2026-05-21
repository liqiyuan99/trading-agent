const COLORS = {
  Buy:         'bg-green-500 text-white',
  Overweight:  'bg-green-100 text-green-800',
  Hold:        'bg-yellow-100 text-yellow-800',
  Underweight: 'bg-orange-100 text-orange-800',
  Sell:        'bg-red-500 text-white',
}

export function RecommendationBadge({ value }) {
  if (!value) return <span className="text-gray-400 text-sm">—</span>
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        COLORS[value] ?? 'bg-gray-100 text-gray-700'
      }`}
    >
      {value}
    </span>
  )
}
