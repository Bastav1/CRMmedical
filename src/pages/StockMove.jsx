import { useState } from 'react'
import { useCollection } from '../lib/hooks'
import * as db from '../lib/db'
import { addStock, deductFEFO, productStock, fefoBatches } from '../lib/stock'
import { logAudit } from '../lib/audit'
import { PageHeader, Field, Badge, Empty } from '../components/ui'
import { fmtDateTime, today } from '../lib/format'
import BarcodeScanner from '../components/BarcodeScanner'

export default function StockMove({ mode }) {
  const isIn = mode === 'in'
  const products = useCollection('products')
  const moves = useCollection('stockMoves')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [reason, setReason] = useState(isIn ? 'Purchase / opening' : 'Sale adjustment')
  const [msg, setMsg] = useState('')
  const [msgTone, setMsgTone] = useState('green') // 'green' | 'rose'
  const [scanHighlight, setScanHighlight] = useState(false)

  const product = products.find((p) => p.id === productId)
  const available = productId ? productStock(productId) : 0

  // Called by BarcodeScanner when a barcode/QR is successfully decoded.
  // We try to auto-match a product by code, name, or GTIN, then pre-fill
  // batch, expiry, qty from the scanned payload.
  const handleScan = (parsed) => {
    let matched = null

    // 1. Try to match by productCode from scan (exact code field)
    if (parsed.productCode) {
      matched = products.find(
        (p) => p.code === parsed.productCode ||
               p.id === parsed.productCode
      )
    }

    // 2. Try to match GTIN last 8-13 digits against product codes
    if (!matched && parsed.gtin) {
      const gtin = String(parsed.gtin)
      matched = products.find((p) => gtin.endsWith(p.code || ''))
    }

    // 3. Try to match batch number against existing batches to infer product
    if (!matched && parsed.batchNo) {
      const existingBatch = db.list('batches').find(
        (b) => b.batchNo.toLowerCase() === String(parsed.batchNo).toLowerCase()
      )
      if (existingBatch) {
        matched = products.find((p) => p.id === existingBatch.productId)
      }
    }

    // Apply matched product
    if (matched) {
      setProductId(matched.id)
    }

    // Pre-fill batch fields from scan
    if (parsed.batchNo) setBatchNo(String(parsed.batchNo))
    if (parsed.expiryDate) setExpiryDate(parsed.expiryDate)
    if (parsed.qty) setQty(String(parsed.qty))

    // Flash form to indicate scan applied
    setScanHighlight(true)
    setTimeout(() => setScanHighlight(false), 1200)

    setMsg(
      matched
        ? `✓ Scanned: ${matched.name}${parsed.batchNo ? ' · Batch ' + parsed.batchNo : ''}`
        : `✓ Scanned batch "${parsed.batchNo || parsed.raw}". Select product manually if not auto-matched.`
    )
    setMsgTone(matched ? 'green' : 'amber')
  }

  const submit = (e) => {
    e.preventDefault()
    const q = Number(qty)
    if (!productId || q <= 0) return
    if (isIn) {
      if (!batchNo) { setMsg('Batch number is required for stock in.'); setMsgTone('rose'); return }
      addStock(productId, batchNo, q, { expiryDate, mrp: product.mrp, costPrice: product.purchasePrice })
    } else {
      if (q > available) { setMsg(`Only ${available} units available.`); setMsgTone('rose'); return }
      const { allocations } = deductFEFO(productId, q)
      logAudit('Stock Out', `${product.name} -${q} via ${allocations.map((a) => a.batchNo).join(', ')}`)
    }
    db.insert('stockMoves', {
      type: isIn ? 'IN' : 'OUT',
      productId,
      productName: product.name,
      qty: q,
      batchNo: isIn ? batchNo : '(FEFO)',
      reason,
      date: new Date().toISOString(),
    })
    if (isIn) logAudit('Stock In', `${product.name} +${q} batch ${batchNo}`)
    setMsg(`${isIn ? 'Added' : 'Removed'} ${q} units of ${product.name}.`)
    setMsgTone('green')
    setQty(''); setBatchNo(''); setExpiryDate('')
  }

  const recent = moves.filter((m) => m.type === (isIn ? 'IN' : 'OUT')).slice(0, 10)

  const msgStyle = {
    green:  'text-emerald-700 bg-emerald-50 border border-emerald-200',
    rose:   'text-rose-700 bg-rose-50 border border-rose-200',
    amber:  'text-amber-700 bg-amber-50 border border-amber-200',
  }

  return (
    <div>
      <PageHeader
        title={isIn ? 'Stock In' : 'Stock Out'}
        subtitle={isIn ? 'Receive stock into a batch — scan or enter manually' : 'Issue / adjust stock (FEFO auto-allocation)'}
      />

      <div className="grid lg:grid-cols-2 gap-5">
        {/* ── Manual entry form ── */}
        <form
          onSubmit={submit}
          className={`card p-5 space-y-4 transition-all duration-300 ${scanHighlight ? 'ring-2 ring-brand-400 shadow-md' : ''}`}
        >
          {/* Scan badge when fields are auto-filled */}
          {scanHighlight && (
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-700 bg-brand-50 rounded-lg px-3 py-1.5 border border-brand-100">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
              Fields auto-filled from scan
            </div>
          )}

          <Field label="Product *">
            <select
              required
              className="input"
              value={productId}
              onChange={(e) => { setProductId(e.target.value); setMsg('') }}
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.brand})</option>
              ))}
            </select>
          </Field>

          {product && (
            <div className="text-sm text-slate-500">
              Current stock: <Badge tone="brand">{available} units</Badge>
              <span className="ml-2">· Reorder {product.reorderLevel}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantity *">
              <input
                required
                type="number"
                min="1"
                className="input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </Field>
            {isIn && (
              <Field label="Batch No. *">
                <input
                  required
                  className="input"
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                  placeholder="e.g. BCA-1001"
                />
              </Field>
            )}
          </div>

          {isIn && (
            <Field label="Expiry Date">
              <input
                type="date"
                className="input"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </Field>
          )}

          <Field label="Reason / Reference">
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          {!isIn && product && (
            <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="font-semibold mb-1">FEFO allocation preview</div>
              {fefoBatches(productId).slice(0, 4).map((b) => (
                <div key={b.id}>{b.batchNo} — {b.qty} units · exp {b.expiryDate}</div>
              ))}
            </div>
          )}

          {msg && (
            <div className={`text-sm rounded-lg p-2.5 ${msgStyle[msgTone]}`}>{msg}</div>
          )}

          <button
            className={`${isIn ? 'btn-primary' : 'btn-danger'} w-full justify-center`}
          >
            {isIn ? '+ Add Stock' : '− Issue Stock'}
          </button>
        </form>

        {/* ── Right panel: recent moves ── */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-3">
            Recent {isIn ? 'Stock-In' : 'Stock-Out'} Movements
          </h3>
          {recent.length === 0 ? (
            <Empty title="No movements yet" />
          ) : (
            <div className="space-y-2">
              {recent.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
                  <div>
                    <div className="font-medium">{m.productName}</div>
                    <div className="text-xs text-slate-400">{m.reason} · {fmtDateTime(m.date)}</div>
                  </div>
                  <Badge tone={isIn ? 'green' : 'rose'}>
                    {isIn ? '+' : '−'}{m.qty} {m.batchNo}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Barcode / QR Scanner (stock-in only) ── */}
      {isIn && (
        <div className="mt-5">
          <BarcodeScanner onScan={handleScan} isInMode={isIn} />
        </div>
      )}
    </div>
  )
}
