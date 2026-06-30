import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCollection } from '../lib/hooks'
import { buildTrie } from '../lib/search'
import { NAV } from '../nav'

// Type badge colours
const TYPE_STYLES = {
  Page:     'bg-brand-50 text-brand-700',
  Product:  'bg-emerald-50 text-emerald-700',
  Batch:    'bg-orange-50 text-orange-700',
  Customer: 'bg-sky-50 text-sky-700',
  Vendor:   'bg-violet-50 text-violet-700',
  Invoice:  'bg-amber-50 text-amber-700',
  Purchase: 'bg-rose-50 text-rose-700',
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(-1)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const navigate = useNavigate()

  // Subscribe to all searchable collections
  const products  = useCollection('products')
  const batches   = useCollection('batches')
  const customers = useCollection('customers')
  const vendors   = useCollection('vendors')
  const sales     = useCollection('sales')
  const purchases = useCollection('purchases')

  // Rebuild trie whenever data changes (debounced via useMemo — fast enough for
  // typical ERP dataset sizes; swap to Web Worker for >50 k records)
  const trie = useMemo(
    () => buildTrie({ products, batches, customers, vendors, sales, purchases }, NAV),
    [products, batches, customers, vendors, sales, purchases]
  )

  const results = useMemo(() => {
    if (!query.trim()) return []
    return trie.search(query.trim(), 10)
  }, [query, trie])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (!open) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocused((f) => Math.min(f + 1, results.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused((f) => Math.max(f - 1, 0)) }
      else if (e.key === 'Enter' && focused >= 0 && results[focused]) {
        e.preventDefault()
        go(results[focused])
      } else if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, focused, results])

  // Global shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Scroll focused item into view
  useEffect(() => {
    if (listRef.current && focused >= 0) {
      const item = listRef.current.children[focused]
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [focused])

  const go = (result) => {
    navigate(result.link)
    setOpen(false)
    setQuery('')
    setFocused(-1)
    inputRef.current?.blur()
  }

  const handleChange = (e) => {
    setQuery(e.target.value)
    setFocused(-1)
    setOpen(true)
  }

  const handleFocus = () => {
    setOpen(true)
  }

  // Highlight matching prefix in text
  const highlight = (text, q) => {
    if (!q || !text) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-brand-100 text-brand-800 rounded px-0.5 not-italic font-semibold">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div className="relative hidden sm:block">
      <div className="relative">
        <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          className="input pl-9 pr-16 w-56 lg:w-80 transition-all focus:w-72 lg:focus:w-96"
          placeholder="Search anything…"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          autoComplete="off"
        />
        <kbd className="absolute right-2.5 top-1.5 hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded">
          ⌘K
        </kbd>
      </div>

      {open && query.trim() && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => { setOpen(false); setQuery('') }} />

          {/* Dropdown */}
          <div className="absolute top-full mt-2 left-0 w-[420px] bg-white rounded-2xl border border-slate-200/90 shadow-2xl z-40 overflow-hidden">
            {results.length === 0 ? (
              <div className="py-10 flex flex-col items-center text-slate-400 gap-2">
                <svg className="w-8 h-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                </svg>
                <p className="text-xs font-medium text-slate-500">No results for <span className="font-bold text-slate-700">"{query}"</span></p>
                <p className="text-[11px] text-slate-400">Try searching by product name, batch no., invoice no., customer…</p>
              </div>
            ) : (
              <>
                <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{results.length} result{results.length > 1 ? 's' : ''}</span>
                  <span className="text-[10px] text-slate-300">↑↓ navigate · Enter to open · Esc to close</span>
                </div>
                <ul ref={listRef} className="max-h-[400px] overflow-y-auto pb-2">
                  {results.map((r, i) => (
                    <li
                      key={r.id}
                      onClick={() => go(r)}
                      onMouseEnter={() => setFocused(i)}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                        focused === i ? 'bg-brand-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Icon */}
                      <div className={`w-8 h-8 rounded-lg grid place-items-center text-sm shrink-0 border ${
                        focused === i
                          ? 'bg-white border-brand-200 shadow-sm'
                          : 'bg-slate-50 border-slate-200/70'
                      }`}>
                        {r.icon}
                      </div>

                      {/* Label & sub */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">
                          {highlight(r.label, query.trim())}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">{r.sub}</div>
                      </div>

                      {/* Type badge */}
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md ${TYPE_STYLES[r.type] || 'bg-slate-100 text-slate-600'}`}>
                        {r.type}
                      </span>

                      {/* Arrow on hover/focus */}
                      {focused === i && (
                        <svg className="w-4 h-4 text-brand-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                  </svg>
                  <span className="text-[10px] text-slate-400 font-medium">Searching across Products, Batches, Customers, Vendors, Sales, Purchases & Pages</span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
