import { useState } from 'react'

// Dependency-free SVG charts with a polished, industry-standard look:
// smooth curves, soft gridlines, hover tooltips, gradient fills, rounded bars.
// No external libraries — keeps the bundle small and avoids any CDN/fetch.

const PALETTE = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

function niceMax(v) {
  if (v <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * pow
}

const fmtK = (n) => {
  const a = Math.abs(n)
  if (a >= 1e7) return '₹' + (n / 1e7).toFixed(1) + 'Cr'
  if (a >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L'
  if (a >= 1e3) return '₹' + (n / 1e3).toFixed(1) + 'k'
  return '₹' + Math.round(n)
}
const fmtFull = (n) => '₹' + Math.round(n).toLocaleString('en-IN')

// Catmull-Rom → cubic Bézier smoothing for a polished line.
function smoothPath(pts) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`
  }
  return d
}

// ---- Line / Area chart -------------------------------------------------
export function LineChart({ data, height = 240, color = PALETTE[0], area = true, valueFmt = fmtK, smooth = true }) {
  const [hover, setHover] = useState(null)
  const W = 640, H = height, pad = { t: 18, r: 18, b: 30, l: 52 }
  if (!data || data.length === 0) return <Empty h={height} />
  const max = niceMax(Math.max(...data.map((d) => d.value), 1))
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b
  const x = (i) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw)
  const y = (v) => pad.t + ih - (v / max) * ih
  const pts = data.map((d, i) => ({ x: x(i), y: y(d.value), d }))
  const line = smooth ? smoothPath(pts) : 'M ' + pts.map((p) => `${p.x},${p.y}`).join(' L ')
  const areaPath = `${line} L ${pts[pts.length - 1].x},${y(0)} L ${pts[0].x},${y(0)} Z`
  const gid = 'ln' + color.replace('#', '')
  return (
    <div className="relative">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes chartDraw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fadeInArea {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scalePoint {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      ` }} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih * g} y2={pad.t + ih * g} stroke="#eef2f7" strokeWidth="1" strokeDasharray={g === 1 ? '0' : '3 4'} />
            <text x={pad.l - 8} y={pad.t + ih * g + 4} textAnchor="end" fontSize="10.5" fill="#94a3b8">{valueFmt(max * (1 - g))}</text>
          </g>
        ))}
        {area && (
          <path
            d={areaPath}
            fill={`url(#${gid})`}
            style={{
              animation: 'fadeInArea 1.2s ease-in-out forwards',
              opacity: 0,
              animationDelay: '0.4s'
            }}
          />
        )}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{
            strokeDasharray: 3000,
            strokeDashoffset: 3000,
            animation: 'chartDraw 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards'
          }}
        />
        {pts.map((p, i) => (
          <g key={i}>
            {(data.length <= 16 || i % Math.ceil(data.length / 8) === 0) &&
              <text x={p.x} y={H - 10} textAnchor="middle" fontSize="10.5" fill="#94a3b8">{p.d.label}</text>}
            {hover === i && <line x1={p.x} x2={p.x} y1={pad.t} y2={pad.t + ih} stroke={color} strokeWidth="1" strokeOpacity="0.3" />}
            <circle
              cx={p.x}
              cy={p.y}
              r={hover === i ? 5 : 3}
              fill="#fff"
              stroke={color}
              strokeWidth="2.5"
              style={{
                transformOrigin: `${p.x}px ${p.y}px`,
                animation: 'scalePoint 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                animationDelay: `${0.3 + i * 0.04}s`,
                opacity: 0
              }}
            />
            <rect x={p.x - iw / data.length / 2} y={pad.t} width={iw / data.length} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
      </svg>
      {hover != null && (
        <Tip x={(pts[hover].x / W) * 100} y={(pts[hover].y / H) * 100} label={data[hover].label} value={fmtFull(data[hover].value)} color={color} />
      )}
    </div>
  )
}

// ---- Bar chart ---------------------------------------------------------
export function BarChart({ data, height = 240, valueFmt = fmtK, horizontal = false }) {
  const [hover, setHover] = useState(null)
  if (!data || data.length === 0) return <Empty h={height} />
  if (horizontal) return <HBar data={data} valueFmt={valueFmt} />
  const W = 640, H = height, pad = { t: 18, r: 18, b: 30, l: 52 }
  const max = niceMax(Math.max(...data.map((d) => d.value), 1))
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b
  const slot = iw / data.length
  const bw = Math.min(46, slot * 0.6)
  const y = (v) => pad.t + ih - (v / max) * ih
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        <defs>
          {PALETTE.map((c, i) => (
            <linearGradient key={i} id={`bar${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity="0.95" />
              <stop offset="100%" stopColor={c} stopOpacity="0.6" />
            </linearGradient>
          ))}
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih * g} y2={pad.t + ih * g} stroke="#eef2f7" strokeDasharray={g === 1 ? '0' : '3 4'} />
            <text x={pad.l - 8} y={pad.t + ih * g + 4} textAnchor="end" fontSize="10.5" fill="#94a3b8">{valueFmt(max * (1 - g))}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + slot * i + (slot - bw) / 2
          const h = (d.value / max) * ih
          const ci = i % PALETTE.length
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={cx} y={pad.t + ih - h} width={bw} height={Math.max(0, h)} rx="6"
                fill={d.color ? d.color : `url(#bar${ci})`} opacity={hover == null || hover === i ? 1 : 0.45} className="transition-opacity" />
              <text x={cx + bw / 2} y={H - 10} textAnchor="middle" fontSize="10.5" fill="#94a3b8">{d.label}</text>
              <rect x={cx} y={pad.t} width={bw} height={ih} fill="transparent" />
            </g>
          )
        })}
      </svg>
      {hover != null && (() => {
        const cx = pad.l + slot * hover + slot / 2
        return <Tip x={(cx / W) * 100} y={(y(data[hover].value) / H) * 100} label={data[hover].label} value={fmtFull(data[hover].value)} color={PALETTE[hover % PALETTE.length]} />
      })()}
    </div>
  )
}

function HBar({ data, valueFmt }) {
  const max = niceMax(Math.max(...data.map((d) => d.value), 1))
  return (
    <div className="space-y-3 pt-1">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <div className="w-28 truncate text-slate-500 text-right shrink-0" title={d.label}>{d.label}</div>
          <div className="flex-1 bg-slate-100 rounded-lg h-6 overflow-hidden relative">
            <div className="h-full rounded-lg flex items-center justify-end px-2 text-[11px] font-semibold text-white transition-all duration-500"
              style={{ width: `${Math.max(10, (d.value / max) * 100)}%`, background: `linear-gradient(90deg, ${d.color || PALETTE[i % PALETTE.length]}cc, ${d.color || PALETTE[i % PALETTE.length]})` }}>
              {valueFmt(d.value)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- Donut chart -------------------------------------------------------
export function DonutChart({ data, size = 190, thickness = 28, centerLabel, centerValue }) {
  const [hover, setHover] = useState(null)
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const r = (size - thickness) / 2
  const cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
        {data.map((d, i) => {
          const frac = d.value / total
          const dash = frac * circ
          const seg = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={d.color || PALETTE[i % PALETTE.length]} strokeWidth={hover === i ? thickness + 4 : thickness}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              className="transition-all cursor-pointer" style={{ opacity: hover == null || hover === i ? 1 : 0.5 }} />
          )
          offset += dash
          return seg
        })}
      </svg>
      <div className="space-y-2 text-sm min-w-0">
        {(centerValue != null) && <div className="text-2xl font-bold text-slate-800 leading-none">{centerValue} <span className="text-xs font-normal text-slate-400">{centerLabel}</span></div>}
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color || PALETTE[i % PALETTE.length] }} />
            <span className="text-slate-600 truncate flex-1">{d.label}</span>
            <span className="font-semibold text-slate-700 tabular-nums">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Sparkline (inline trend) -----------------------------------------
export function Sparkline({ data, color = PALETTE[0], width = 240, height = 32 }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data), min = Math.min(...data)
  const span = max - min || 1
  const x = (i) => (i / (data.length - 1)) * width
  const y = (v) => height - 3 - ((v - min) / span) * (height - 6)
  const pts = data.map((v, i) => ({ x: x(i), y: y(v) }))
  const line = smoothPath(pts)
  const gid = 'sp' + color.replace('#', '')
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L ${width},${height} L 0,${height} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function ChartCard({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Tip({ x, y, label, value, color }) {
  return (
    <div className="absolute pointer-events-none z-10 -translate-x-1/2 -translate-y-full"
      style={{ left: `${x}%`, top: `calc(${y}% - 10px)` }}>
      <div className="bg-slate-900 text-white rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg">
        <div className="text-slate-300">{label}</div>
        <div className="font-semibold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: color }} />{value}</div>
      </div>
    </div>
  )
}

function Empty({ h }) {
  return <div className="grid place-items-center text-slate-300 text-sm" style={{ height: h }}>No data to display</div>
}

export { PALETTE }
