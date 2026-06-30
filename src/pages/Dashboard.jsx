import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCollection } from '../lib/hooks'
import { productStock } from '../lib/stock'
import { PageHeader, Stat, Badge, CountUp } from '../components/ui'
import { LineChart, BarChart, DonutChart, ChartCard, PALETTE } from '../components/charts'
import { inr, num, fmtDate, daysUntil, today } from '../lib/format'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Dashboard() {
  const products = useCollection('products')
  const batches = useCollection('batches')
  const sales = useCollection('sales')
  const purchases = useCollection('purchases')

  const d = useMemo(() => {
    const totalStock = batches.reduce((s, b) => s + Number(b.qty || 0), 0)
    const stockValue = batches.reduce((s, b) => s + Number(b.qty || 0) * Number(b.mrp || 0), 0)
    const todaysSales = sales.filter((s) => (s.date || '').slice(0, 10) === today()).reduce((s, i) => s + Number(i.grandTotal || 0), 0)
    const lowStock = products.filter((p) => productStock(p.id, batches) <= (p.reorderLevel || 0))
    const expiringSoon = batches.filter((b) => b.qty > 0 && daysUntil(b.expiryDate) <= 90)

    // last 14 days sales trend
    const dayMap = {}
    for (let i = 13; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); dayMap[dt.toISOString().slice(0, 10)] = 0 }
    sales.forEach((s) => { const k = (s.date || '').slice(0, 10); if (k in dayMap) dayMap[k] += Number(s.grandTotal || 0) })
    const trend = Object.entries(dayMap).map(([k, v]) => ({ label: new Date(k).getDate(), value: Math.round(v) }))
    const spark14 = trend.map((t) => t.value)

    // monthly sales (bar)
    const monMap = {}
    sales.forEach((s) => { const k = (s.date || '').slice(0, 7); monMap[k] = (monMap[k] || 0) + Number(s.grandTotal || 0) })
    const months = Object.entries(monMap).sort().slice(-6).map(([k, v]) => ({ label: k.slice(5), value: Math.round(v) }))

    // payment mode mix (donut)
    const payMap = {}
    sales.forEach((s) => { payMap[s.payMode] = (payMap[s.payMode] || 0) + Number(s.grandTotal || 0) })
    const payMix = Object.entries(payMap).map(([label, value]) => ({ label, value: Math.round(value) }))

    // top products by revenue
    const prodMap = {}
    sales.forEach((s) => (s.lines || []).forEach((l) => { prodMap[l.name] = (prodMap[l.name] || 0) + (l.lineTaxable || 0) }))
    const topProducts = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value: Math.round(value) }))

    // sales by day-of-week
    const dowMap = [0, 0, 0, 0, 0, 0, 0]
    sales.forEach((s) => { const wd = new Date(s.date).getDay(); dowMap[wd] += Number(s.grandTotal || 0) })
    const byDow = dowMap.map((v, i) => ({ label: DOW[i], value: Math.round(v) }))

    // month-over-month trend % for KPI
    const monKeys = Object.keys(monMap).sort()
    const cur = monMap[monKeys[monKeys.length - 1]] || 0
    const prev = monMap[monKeys[monKeys.length - 2]] || 0
    const momTrend = prev ? Math.round(((cur - prev) / prev) * 100) : null

    const totalRevenue = sales.reduce((s, i) => s + Number(i.grandTotal || 0), 0)
    const totalPurch = purchases.reduce((s, p) => s + Number(p.grandTotal || 0), 0)

    return { totalStock, stockValue, todaysSales, lowStock, expiringSoon, trend, spark14, months, payMix, topProducts, byDow, momTrend, totalRevenue, totalPurch }
  }, [products, batches, sales, purchases])

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Overview as of ${fmtDate(new Date())} · last 3 months`} />

      {/* KPI cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total Products" value={<CountUp end={products.length} formatter={num} />} sub={`${products.filter((p) => p.group === 'Medicine').length} medicines`} icon="💊" tone="brand" />
        <Stat label="Stock Value" value={<CountUp end={d.stockValue} formatter={inr} />} sub={`${num(d.totalStock)} units`} icon="📦" tone="green" />
        <Stat label="Today's Sales" value={<CountUp end={d.todaysSales} formatter={inr} />} trend={d.momTrend} sub="vs last month" icon="🧾" tone="brand" spark={d.spark14} />
        <Stat label="Low Stock Alerts" value={<CountUp end={d.lowStock.length} formatter={num} />} sub={`${d.expiringSoon.length} batches expiring ≤90d`} icon="⚠️" tone="amber" />
      </div>

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <ChartCard className="lg:col-span-2" title="Sales Trend" subtitle="Daily revenue — last 14 days"
          action={<Link to="/reports/sales" className="text-sm text-brand-600 hover:underline">Report →</Link>}>
          <LineChart data={d.trend} color="#1f5be0" height={240} />
        </ChartCard>
        <ChartCard title="Payment Mix" subtitle="Revenue by payment mode">
          {d.payMix.length ? <DonutChart data={d.payMix} centerValue={d.payMix.length} centerLabel="modes" /> : <p className="text-sm text-slate-400 py-10 text-center">No data</p>}
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <ChartCard title="Monthly Sales" subtitle="Last 6 months">
          <BarChart data={d.months} height={220} />
        </ChartCard>
        <ChartCard title="Top Products" subtitle="By revenue contribution">
          <BarChart data={d.topProducts} horizontal />
        </ChartCard>
      </div>

      {/* Charts row 3 + alerts */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <ChartCard title="Sales by Weekday" subtitle="Busiest days">
          <BarChart data={d.byDow} height={200} />
        </ChartCard>

        <ChartCard className="lg:col-span-2" title="Expiry Alerts" subtitle="Batches expiring within 90 days"
          action={<Link to="/reports/expiry" className="text-sm text-brand-600 hover:underline">All →</Link>}>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {d.expiringSoon.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">Nothing expiring within 90 days. ✅</p>}
            {d.expiringSoon.slice(0, 10).map((b) => {
              const p = products.find((x) => x.id === b.productId)
              const dd = daysUntil(b.expiryDate)
              return (
                <div key={b.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-1.5">
                  <div className="min-w-0"><div className="font-medium truncate">{p?.name || 'Unknown'}</div><div className="text-xs text-slate-400">Batch {b.batchNo} · {b.qty} units</div></div>
                  <Badge tone={dd < 0 ? 'rose' : dd <= 30 ? 'amber' : 'slate'}>{dd < 0 ? 'Expired' : `${dd}d`}</Badge>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>

      {/* Low stock chips */}
      <div className="card p-4 mt-4">
        <h3 className="font-semibold text-slate-800 mb-3">Low Stock — reorder needed</h3>
        {d.lowStock.length === 0 ? <p className="text-sm text-slate-400">All products above reorder level. 👍</p> : (
          <div className="flex flex-wrap gap-2">
            {d.lowStock.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-sm">
                <span className="font-medium text-slate-700">{p.name}</span>
                <Badge tone="amber">{productStock(p.id, batches)} / {p.reorderLevel}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
