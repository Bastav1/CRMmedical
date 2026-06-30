import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCollection } from '../lib/hooks'
import { productStock, fefoBatches } from '../lib/stock'
import { PageHeader, Toolbar, Badge, Empty, Stat, CountUp } from '../components/ui'
import { inr, num, fmtDate, daysUntil, exportCSV } from '../lib/format'

export default function Stock() {
  const products = useCollection('products')
  const batches = useCollection('batches')
  const [q, setQ] = useState('')
  const [only, setOnly] = useState('all')

  const data = useMemo(() => {
    const s = q.toLowerCase()
    return products
      .map((p) => {
        const stock = productStock(p.id, batches)
        const fefo = fefoBatches(p.id, batches)
        const next = fefo[0]
        const value = batches.filter((b) => b.productId === p.id).reduce((acc, b) => acc + b.qty * b.costPrice, 0)
        return { ...p, stock, value, nextExpiry: next?.expiryDate, nextBatch: next?.batchNo }
      })
      .filter((p) => !s || [p.name, p.brand, p.molecule].some((v) => (v || '').toLowerCase().includes(s)))
      .filter((p) => (only === 'low' ? p.stock <= p.reorderLevel : only === 'zero' ? p.stock === 0 : true))
  }, [products, batches, q, only])

  const totalValue = data.reduce((s, p) => s + p.value, 0)

  return (
    <div>
      <PageHeader title="Current Stock" subtitle="Live stock by product with FEFO next-expiry batch" actions={<>
        <button className="btn-ghost" onClick={() => exportCSV('current-stock', data, [
          { key: 'name', label: 'Product' }, { key: 'brand', label: 'Brand' }, { key: 'stock', label: 'Stock' },
          { key: 'reorderLevel', label: 'Reorder' }, { key: 'nextExpiry', label: 'Next Expiry' }, { key: 'value', label: 'Value' },
        ])}>⬇ Excel</button>
        <Link to="/stock/in" className="btn-primary">Stock In</Link>
        <Link to="/stock/out" className="btn-ghost">Stock Out</Link>
      </>} />

      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <Stat label="SKUs" value={<CountUp end={data.length} formatter={num} />} icon="💊" />
        <Stat label="Total Units" value={<CountUp end={data.reduce((s, p) => s + p.stock, 0)} formatter={num} />} icon="📦" tone="green" />
        <Stat label="Stock Value (cost)" value={<CountUp end={totalValue} formatter={inr} />} icon="💰" tone="brand" />
      </div>

      <Toolbar>
        <input className="input max-w-xs" placeholder="Search product…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1">
          {[['all', 'All'], ['low', 'Low stock'], ['zero', 'Out of stock']].map(([k, l]) => (
            <button key={k} className={`btn-sm rounded-lg ${only === k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`} onClick={() => setOnly(k)}>{l}</button>
          ))}
        </div>
      </Toolbar>

      <div className="card overflow-x-auto">
        {data.length === 0 ? <Empty title="No stock data" /> : (
          <table className="w-full">
            <thead><tr><th className="th">Product</th><th className="th">Pack</th><th className="th text-right">In Stock</th><th className="th text-right">Reorder</th><th className="th">Next Expiry (FEFO)</th><th className="th text-right">Value</th></tr></thead>
            <tbody>{data.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="td font-medium">{p.name}<div className="text-xs text-slate-400">{p.brand}</div></td>
                <td className="td">{p.pack}</td>
                <td className="td text-right font-semibold">{p.stock}</td>
                <td className="td text-right text-slate-500">{p.reorderLevel}</td>
                <td className="td">{p.nextExpiry ? <>{fmtDate(p.nextExpiry)} <span className="text-xs text-slate-400">({p.nextBatch})</span> {daysUntil(p.nextExpiry) <= 90 && <Badge tone={daysUntil(p.nextExpiry) < 0 ? 'rose' : 'amber'}>{daysUntil(p.nextExpiry)}d</Badge>}</> : '—'}</td>
                <td className="td text-right">{inr(p.value)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
