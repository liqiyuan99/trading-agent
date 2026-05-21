import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useReactToPrint } from 'react-to-print'
import { RecommendationBadge } from '../components/RecommendationBadge.jsx'

const TABS = ['Summary', 'Fundamentals', 'Sentiment', 'Technical', 'Risk', 'Raw']

const STATUS_PILL = {
  complete: 'bg-green-100 text-green-700',
  failed:   'bg-red-100 text-red-700',
  running:  'bg-blue-100 text-blue-700',
  pending:  'bg-gray-100 text-gray-500',
}

// Labels shown in each language
const LABELS = {
  en: {
    summary:      'Summary',
    fundamentals: 'Fundamentals',
    sentiment:    'Sentiment & News',
    technical:    'Technical Analysis',
    risk:         'Risk Assessment',
    researchPlan: "Research Manager's Plan",
    traderPlan:   "Trader's Proposal",
    riskDebate:   'Risk Debate',
    ticker:       'Ticker',
    analysisDate: 'Analysis date',
    runDate:      'Run',
    model:        'Model',
    generated:    'Generated',
    recommendation: 'Recommendation',
    exportPdf:    'Export PDF',
    noTranslation: 'Chinese translation not available for this run.',
  },
  zh: {
    summary:      '投资摘要',
    fundamentals: '基本面分析',
    sentiment:    '情绪与新闻分析',
    technical:    '技术分析',
    risk:         '风险评估',
    researchPlan: '研究经理计划',
    traderPlan:   '交易员方案',
    riskDebate:   '风险辩论',
    ticker:       '股票代码',
    analysisDate: '分析日期',
    runDate:      '运行时间',
    model:        '模型',
    generated:    '生成时间',
    recommendation: '建议',
    exportPdf:    '导出 PDF',
    noTranslation: '此分析暂无中文翻译。',
  },
}

function MarkdownPane({ content }) {
  if (!content) return <p className="text-gray-400 text-sm italic">No content available.</p>
  return (
    <div className="prose prose-sm max-w-none text-gray-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Printable layout — all sections stacked, no tabs, used by react-to-print
// ---------------------------------------------------------------------------
const PrintableReport = React.forwardRef(function PrintableReport({ run, lang }, ref) {
  const L = LABELS[lang]
  const ar = run.analyst_reports ?? {}
  const tr = run.translations ?? {}
  const ra = run.risk_assessment ?? {}

  function pick(enVal, zhKey) {
    if (lang === 'zh' && tr[zhKey]) return tr[zhKey]
    return enVal ?? ''
  }

  const sections = [
    {
      title: L.summary,
      parts: [
        pick(run.final_report, 'final_report'),
        pick(ar.investment_plan, 'investment_plan') && `---\n\n**${L.researchPlan}**\n\n${pick(ar.investment_plan, 'investment_plan')}`,
        pick(ar.trader_plan, 'trader_plan') && `---\n\n**${L.traderPlan}**\n\n${pick(ar.trader_plan, 'trader_plan')}`,
      ].filter(Boolean).join('\n\n'),
    },
    {
      title: L.fundamentals,
      parts: pick(ar.fundamentals, 'fundamentals'),
    },
    {
      title: L.sentiment,
      parts: [pick(ar.sentiment, 'sentiment'), pick(ar.news, 'news')].filter(Boolean).join('\n\n---\n\n'),
    },
    {
      title: L.technical,
      parts: pick(ar.technical, 'technical'),
    },
    {
      title: L.risk,
      parts: [
        pick(ra.judge_decision, 'risk_judgment'),
        pick(ra.history, 'risk_history') && `---\n\n**${L.riskDebate}**\n\n${pick(ra.history, 'risk_history')}`,
      ].filter(Boolean).join('\n\n'),
    },
  ].filter(s => s.parts)

  return (
    <div ref={ref} style={{ fontFamily: 'Georgia, serif', padding: '48px', color: '#111', lineHeight: 1.7 }}>
      {/* Report header */}
      <div style={{ borderBottom: '2px solid #111', paddingBottom: '20px', marginBottom: '32px' }}>
        <div style={{ fontSize: '32px', fontWeight: 'bold', letterSpacing: '-0.5px' }}>{run.ticker}</div>
        <div style={{ fontSize: '14px', color: '#555', marginTop: '8px' }}>
          {L.analysisDate}: {run.analysis_date}
          {' · '}
          {L.recommendation}: <strong>{run.recommendation ?? '—'}</strong>
          {run.model_used && ` · ${L.model}: ${run.model_used}`}
        </div>
        <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
          {L.generated}: {new Date(run.run_timestamp + 'Z').toLocaleString()}
          {lang === 'zh' ? ' · 报告语言: 简体中文' : ''}
        </div>
      </div>

      {/* Sections */}
      {sections.map((section, i) => (
        <div key={i} style={{ marginBottom: '40px', pageBreakInside: 'avoid' }}>
          <h2 style={{
            fontSize: '18px', fontWeight: 'bold',
            borderBottom: '1px solid #ddd', paddingBottom: '8px', marginBottom: '16px',
          }}>
            {section.title}
          </h2>
          <div style={{ fontSize: '13px' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.parts}</ReactMarkdown>
          </div>
        </div>
      ))}

      {/* Footer */}
      <div style={{ borderTop: '1px solid #ddd', paddingTop: '12px', fontSize: '11px', color: '#aaa', marginTop: '40px' }}>
        StockResearch · {run.ticker} · {run.analysis_date}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Main RunDetail page
// ---------------------------------------------------------------------------
export function RunDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [activeTab, setActiveTab] = useState('Summary')
  const [lang, setLang] = useState('en')
  const [loading, setLoading] = useState(true)
  const printRef = useRef(null)

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: run ? `${run.ticker}_${run.analysis_date}_${lang}` : 'report',
  })

  useEffect(() => {
    fetch(`/api/runs/${id}`)
      .then(r => r.json())
      .then(data => { setRun(data); setLoading(false) })
  }, [id])

  if (loading) return <p className="text-gray-400 py-8">Loading…</p>
  if (!run || run.detail === 'Run not found') return <p className="text-red-500 py-8">Run not found.</p>

  const L = LABELS[lang]
  const ar = run.analyst_reports ?? {}
  const tr = run.translations ?? {}
  const ra = run.risk_assessment ?? {}
  const hasTranslations = !!run.translations

  function pick(enVal, zhKey) {
    if (lang === 'zh' && tr[zhKey]) return tr[zhKey]
    return enVal ?? ''
  }

  function tabContent() {
    if (lang === 'zh' && !hasTranslations) {
      return <p className="text-gray-400 text-sm italic">{L.noTranslation}</p>
    }

    switch (activeTab) {
      case 'Summary': {
        const parts = [
          pick(run.final_report, 'final_report'),
          pick(ar.investment_plan, 'investment_plan') && `---\n\n**${L.researchPlan}**\n\n${pick(ar.investment_plan, 'investment_plan')}`,
          pick(ar.trader_plan, 'trader_plan') && `---\n\n**${L.traderPlan}**\n\n${pick(ar.trader_plan, 'trader_plan')}`,
        ].filter(Boolean).join('\n\n')
        return <MarkdownPane content={parts || null} />
      }
      case 'Fundamentals':
        return <MarkdownPane content={pick(ar.fundamentals, 'fundamentals')} />
      case 'Sentiment': {
        const parts = [pick(ar.sentiment, 'sentiment'), pick(ar.news, 'news')].filter(Boolean).join('\n\n---\n\n')
        return <MarkdownPane content={parts || null} />
      }
      case 'Technical':
        return <MarkdownPane content={pick(ar.technical, 'technical')} />
      case 'Risk': {
        const parts = [
          pick(ra.judge_decision, 'risk_judgment'),
          pick(ra.history, 'risk_history') && `---\n\n**${L.riskDebate}**\n\n${pick(ra.history, 'risk_history')}`,
        ].filter(Boolean).join('\n\n')
        return <MarkdownPane content={parts || null} />
      }
      case 'Raw':
        return (
          <pre className="text-xs text-gray-600 overflow-auto whitespace-pre-wrap break-words">
            {JSON.stringify(run, null, 2)}
          </pre>
        )
      default:
        return null
    }
  }

  return (
    <div>
      <button
        onClick={() => navigate('/history')}
        className="text-sm text-blue-600 hover:underline mb-4 inline-flex items-center gap-1"
      >
        ← Back to History
      </button>

      {/* Header card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{run.ticker}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {L.analysisDate}: <span className="font-medium text-gray-700">{run.analysis_date}</span>
              {' · '}
              {L.runDate}: {new Date(run.run_timestamp + 'Z').toLocaleString()}
            </p>
            {run.model_used && (
              <p className="text-gray-400 text-xs mt-0.5">{L.model}: {run.model_used}</p>
            )}
          </div>

          {/* Right side: badge + controls */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            <RecommendationBadge value={run.recommendation} />

            {/* EN / ZH toggle */}
            <div className="flex rounded-md overflow-hidden border border-gray-300 text-xs font-medium">
              <button
                onClick={() => setLang('en')}
                className={`px-3 py-1.5 transition-colors ${
                  lang === 'en' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => hasTranslations && setLang('zh')}
                disabled={!hasTranslations}
                title={!hasTranslations ? 'Chinese translation not available' : undefined}
                className={`px-3 py-1.5 border-l border-gray-300 transition-colors ${
                  lang === 'zh'
                    ? 'bg-gray-800 text-white'
                    : hasTranslations
                    ? 'bg-white text-gray-600 hover:bg-gray-50'
                    : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                }`}
              >
                中文
              </button>
            </div>

            {/* Export PDF */}
            <button
              onClick={handlePrint}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              {L.exportPdf}
            </button>

            {run.status !== 'complete' && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[run.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {run.status}
              </span>
            )}
          </div>
        </div>

        {run.is_stale && (
          <div className="mt-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
            ⚠️ This run has been in a running state for over 30 minutes and may be stale.
          </div>
        )}
        {run.error_message && (
          <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {run.error_message}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 min-h-48">
        {tabContent()}
      </div>

      {/* Hidden printable version — always in DOM so react-to-print can access it */}
      <div style={{ display: 'none' }}>
        <PrintableReport ref={printRef} run={run} lang={lang} />
      </div>
    </div>
  )
}
