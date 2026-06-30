import { useEffect, useState } from 'react'
import { Sparkline } from './charts'

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, tone = 'brand', icon, trend, spark }) {
  const tones = {
    brand: { tile: 'from-brand-500 to-brand-700', bar: 'bg-brand-500', spark: '#1f5be0' },
    green: { tile: 'from-emerald-500 to-emerald-700', bar: 'bg-emerald-500', spark: '#10b981' },
    amber: { tile: 'from-amber-400 to-amber-600', bar: 'bg-amber-500', spark: '#f59e0b' },
    rose: { tile: 'from-rose-500 to-rose-700', bar: 'bg-rose-500', spark: '#ef4444' },
    slate: { tile: 'from-slate-500 to-slate-700', bar: 'bg-slate-500', spark: '#64748b' },
  }
  const t = tones[tone] || tones.brand
  const up = trend != null && trend >= 0
  return (
    <div className="card p-4 relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className={`absolute left-0 top-0 h-full w-1 ${t.bar}`} />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-bold text-slate-800 mt-1 truncate">{value}</div>
          <div className="flex items-center gap-2 mt-1">
            {trend != null && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
                {up ? '▲' : '▼'} {Math.abs(trend)}%
              </span>
            )}
            {sub && <span className="text-xs text-slate-400 truncate">{sub}</span>}
          </div>
        </div>
        {icon && (
          <div className={`w-11 h-11 rounded-xl grid place-items-center text-xl text-white shadow-sm bg-gradient-to-br ${t.tile} group-hover:scale-105 transition-transform`}>
            {icon}
          </div>
        )}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-2 -mb-1"><Sparkline data={spark} color={t.spark} width={240} height={28} /></div>
      )}
    </div>
  )
}

export function Badge({ children, tone = 'slate', dot }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  }
  const dots = { slate: 'bg-slate-400', green: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500', brand: 'bg-brand-500', blue: 'bg-sky-500' }
  return (
    <span className={`badge ring-1 ring-inset ${tones[tone]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dots[tone]}`} />}
      {children}
    </span>
  )
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-slate-900/40 no-print" onMouseDown={onClose}>
      <div
        className={`card mt-10 w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'} mb-10`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button className="text-slate-400 hover:text-slate-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

export function Empty({ icon = '📭', title = 'Nothing here yet', hint }) {
  return (
    <div className="text-center py-16 text-slate-400">
      <div className="text-4xl mb-2">{icon}</div>
      <div className="font-medium text-slate-500">{title}</div>
      {hint && <div className="text-sm mt-1">{hint}</div>}
    </div>
  )
}

export function Toolbar({ children }) {
  return <div className="flex flex-wrap items-center gap-2 mb-3">{children}</div>
}

// Generic placeholder for enterprise modules not yet fully built — shows the intended
// industry-standard scope so the navigation is complete and the design intent is clear.
export function ModuleStub({ title, subtitle, features = [], note }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Badge tone="amber">Planned module</Badge>
          <span className="text-sm text-slate-500">Core masters & transactions are live; this module is scaffolded with its standard scope.</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map((f) => (
            <div key={f} className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-brand-500 mt-0.5">▣</span>
              <span className="text-sm text-slate-700">{f}</span>
            </div>
          ))}
        </div>
        {note && <p className="text-sm text-slate-500 mt-4">{note}</p>}
      </div>
    </div>
  )
}

export function CountUp({ end, duration = 1200, formatter = (v) => v }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let startTimestamp = null
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      setCount(progress * end)
      if (progress < 1) {
        window.requestAnimationFrame(step)
      }
    }
    window.requestAnimationFrame(step)
  }, [end, duration])

  const displayVal = Number.isInteger(end) ? Math.round(count) : count
  return <>{formatter(displayVal)}</>
}
