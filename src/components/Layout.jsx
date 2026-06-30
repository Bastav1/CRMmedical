import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { NAV } from '../nav'
import { useAuth } from '../lib/auth'
import { useCollection } from '../lib/hooks'
import { productStock } from '../lib/stock'
import { daysUntil, fmtDate } from '../lib/format'

export default function Layout({ children }) {
  const [open, setOpen] = useState(true)
  const { user, logout, company } = useAuth()
  const loc = useLocation()
  const navigate = useNavigate()

  // State for notifications
  const [showNotifications, setShowNotifications] = useState(false)
  const [dismissedNotifications, setDismissedNotifications] = useState(() => {
    try {
      const stored = localStorage.getItem('pharmaerp:dismissed_notifications')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [activeTab, setActiveTab] = useState('All')

  // Real-time collections for generating alerts
  const products = useCollection('products')
  const batches = useCollection('batches')
  const recalls = useCollection('recallActions')
  const coldChainLogs = useCollection('coldChainLogs')
  const pvAdverseEvents = useCollection('pvAdverseEvents')

  // Calculate notifications dynamically
  const computedNotifications = []

  // 1. Low Stock Alerts
  products.forEach((p) => {
    if (!p.active) return
    const stock = productStock(p.id, batches)
    const level = Number(p.reorderLevel ?? 20)
    if (stock <= level) {
      computedNotifications.push({
        id: `low-stock-${p.id}`,
        category: 'Stock',
        type: 'warning',
        title: `Low Stock: ${p.name}`,
        message: `Stock level is ${stock} ${p.form || 'unit'}(s) (Reorder limit: ${level})`,
        severity: stock === 0 ? 'rose' : 'amber',
        link: '/products',
        icon: '📦',
      })
    }
  })

  // 2. Expired & Expiring Batches
  batches.forEach((b) => {
    if (b.qty <= 0) return
    const p = products.find((prod) => prod.id === b.productId)
    const pName = p ? p.name : 'Unknown Product'
    const days = daysUntil(b.expiryDate)
    if (days < 0) {
      computedNotifications.push({
        id: `expired-batch-${b.id}`,
        category: 'Expiry',
        type: 'critical',
        title: `Expired Batch: ${b.batchNo}`,
        message: `${pName} (Batch ${b.batchNo}) expired on ${fmtDate(b.expiryDate)}`,
        severity: 'rose',
        link: '/batches',
        icon: '⚠️',
      })
    } else if (days <= 90) {
      computedNotifications.push({
        id: `expiring-batch-${b.id}`,
        category: 'Expiry',
        type: 'warning',
        title: `Expiring Soon: ${b.batchNo}`,
        message: `${pName} (Batch ${b.batchNo}) expiring in ${days} days`,
        severity: 'amber',
        link: '/batches',
        icon: '⏳',
      })
    }
  })

  // 3. Recalls
  recalls.forEach((r) => {
    if (r.status === 'Closed') return
    computedNotifications.push({
      id: `recall-${r.id}`,
      category: 'Recall',
      type: r.recallClass === 'Class I' ? 'critical' : 'warning',
      title: `${r.recallClass || 'Recall'}: ${r.product}`,
      message: `Batch ${r.batchNumber || '—'} - Recall active. Reason: ${r.reason}`,
      severity: r.recallClass === 'Class I' ? 'rose' : 'amber',
      link: '/recall',
      icon: '🛑',
    })
  })

  // 4. Cold Chain Temperature Alarms
  coldChainLogs.forEach((c) => {
    if (c.status === 'Excursion' || c.severity === 'Critical' || c.severity === 'Major') {
      const isCritical = c.severity === 'Critical' || c.severity === 'Major'
      computedNotifications.push({
        id: `coldchain-${c.id}`,
        category: 'Cold Chain',
        type: isCritical ? 'critical' : 'warning',
        title: `Temp Excursion: ${c.product}`,
        message: `Batch ${c.batch} recorded temp ${c.minTemp}°C to ${c.maxTemp}°C (Vehicle ${c.vehicle})`,
        severity: isCritical ? 'rose' : 'amber',
        link: '/coldchain',
        icon: '❄️',
      })
    }
  })

  // 5. PV Adverse Events
  pvAdverseEvents.forEach((pv) => {
    if (pv.seriousness === 'Serious' && pv.status !== 'Closed' && pv.status !== 'Submitted') {
      computedNotifications.push({
        id: `pv-${pv.id}`,
        category: 'Safety Alert',
        type: 'critical',
        title: `Adverse Event: ${pv.suspectDrug}`,
        message: `Serious Event: ${pv.reaction} (${pv.meddraPt || 'Unclassified'})`,
        severity: 'rose',
        link: '/pv',
        icon: '🛡️',
      })
    }
  })

  // Filter out dismissed ones
  const activeNotifications = computedNotifications.filter((n) => !dismissedNotifications.includes(n.id))

  // Sort critical first
  activeNotifications.sort((a, b) => {
    if (a.type === 'critical' && b.type !== 'critical') return -1
    if (a.type !== 'critical' && b.type === 'critical') return 1
    return 0
  })

  const dismissNotification = (id, e) => {
    e.stopPropagation()
    const updated = [...dismissedNotifications, id]
    setDismissedNotifications(updated)
    localStorage.setItem('pharmaerp:dismissed_notifications', JSON.stringify(updated))
  }

  const dismissAll = () => {
    const allIds = activeNotifications.map((n) => n.id)
    const updated = [...dismissedNotifications, ...allIds]
    setDismissedNotifications(updated)
    localStorage.setItem('pharmaerp:dismissed_notifications', JSON.stringify(updated))
  }

  const handleNotificationClick = (link) => {
    setShowNotifications(false)
    navigate(link)
  }

  const filteredNotifications = activeNotifications.filter((n) => {
    if (activeTab === 'Critical') return n.type === 'critical'
    if (activeTab === 'Warnings') return n.type === 'warning'
    return true
  })

  const activeItem = NAV.flatMap((s) => s.items).find((i) => i.to === loc.pathname)

  return (
    <div className="h-full flex" style={{ background: '#f6f8fb' }}>
      {/* Sidebar */}
      <aside className={`no-print ${open ? 'w-[260px]' : 'w-0'} transition-all duration-200 shrink-0 overflow-hidden flex flex-col bg-slate-50 border-r border-slate-200/70`}>
        <div className="h-16 flex items-center gap-2.5 px-5 shrink-0">
          <div className="w-9 h-9 rounded-xl grid place-items-center text-white font-bold text-lg shadow-sm" style={{ background: 'linear-gradient(135deg,#6366f1,#4338ca)' }}>℞</div>
          <div className="leading-tight">
            <div className="font-bold text-slate-800 text-[15px]">PharmaERP</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-[0.12em] font-semibold">Life Sciences Suite</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
          {NAV.map((sec) => (
            <div key={sec.group}>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] px-3 mb-1.5">{sec.group}</div>
              <div className="space-y-0.5">
                {sec.items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.end}
                    className={({ isActive }) => `pill-nav ${isActive ? 'pill-nav-active' : ''}`}>
                    <span className="nav-ico w-7 h-7 rounded-lg grid place-items-center text-base bg-white border border-slate-200/70 shrink-0 transition-colors">{it.icon}</span>
                    <span className="truncate flex-1">{it.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-200/70">
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl">
            <div className="w-9 h-9 rounded-full grid place-items-center font-bold text-white shrink-0" style={{ background: 'linear-gradient(135deg,#818cf8,#4f46e5)' }}>{user?.name?.[0] || 'U'}</div>
            <div className="leading-tight min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-slate-700 truncate">{user?.name}</div>
              <div className="text-[11px] text-slate-400 truncate">{user?.role}</div>
            </div>
            <button className="text-slate-400 hover:text-rose-600 transition" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="no-print h-16 bg-white/80 backdrop-blur border-b border-slate-200/70 flex items-center gap-3 px-5 shrink-0 sticky top-0 z-20">
          <button className="w-9 h-9 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 transition" onClick={() => setOpen((o) => !o)} title="Toggle menu">
            <Bars />
          </button>
          <div className="hidden md:block">
            <div className="text-[15px] font-bold text-slate-800 leading-tight">{activeItem?.label || 'Dashboard'}</div>
            <div className="text-[11px] text-slate-400">{company?.name}</div>
          </div>
          <div className="flex-1" />
          <div className="relative hidden sm:block">
            <input className="input pl-9 w-56 lg:w-72" placeholder="Search…" />
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          </div>
          <div className="relative">
            <button
              className="w-9 h-9 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 transition relative animate-duration-300"
              onClick={() => setShowNotifications(!showNotifications)}
              title="Notifications"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {activeNotifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-extrabold text-white bg-rose-500 rounded-full ring-2 ring-white animate-pulse">
                  {activeNotifications.length}
                </span>
              )}
            </button>

            {showNotifications && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowNotifications(false)} />
                <div className="absolute right-0 mt-2.5 w-96 bg-white rounded-2xl border border-slate-200/90 shadow-2xl z-40 overflow-hidden flex flex-col max-h-[520px] transition-all transform origin-top-right">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Notifications</h4>
                      <p className="text-[11px] text-slate-400 font-medium">{activeNotifications.length} unresolved alerts</p>
                    </div>
                    {activeNotifications.length > 0 && (
                      <button
                        onClick={dismissAll}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-800 transition"
                      >
                        Dismiss all
                      </button>
                    )}
                  </div>

                  <div className="flex border-b border-slate-100 px-3 bg-white">
                    {[
                      { id: 'All', label: 'All', count: activeNotifications.length },
                      { id: 'Critical', label: 'Critical', count: activeNotifications.filter((n) => n.type === 'critical').length, color: 'text-rose-600' },
                      { id: 'Warnings', label: 'Warnings', count: activeNotifications.filter((n) => n.type === 'warning').length, color: 'text-amber-600' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition border-b-2 -mb-px ${
                          activeTab === tab.id
                            ? 'border-brand-500 text-brand-700 font-bold'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        <span className={tab.color}>{tab.label}</span>
                        {tab.count > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                            activeTab === tab.id
                              ? 'bg-brand-50 text-brand-600'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[360px] scrollbar-thin">
                    {filteredNotifications.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                        <span className="text-3xl mb-2">🔔</span>
                        <p className="text-xs font-medium text-slate-500">No active notifications</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Everything is functioning within limits</p>
                      </div>
                    ) : (
                      filteredNotifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n.link)}
                          className="px-5 py-3.5 hover:bg-slate-50/70 transition cursor-pointer flex gap-3.5 relative group"
                        >
                          <div className={`w-2.5 h-2.5 rounded-full absolute left-1.5 top-[22px] ring-2 ring-white ${
                            n.severity === 'rose' ? 'bg-rose-500' : 'bg-amber-500'
                          }`} />

                          <div className={`w-9 h-9 rounded-xl grid place-items-center text-base shrink-0 select-none ${
                            n.severity === 'rose'
                              ? 'bg-rose-50 text-rose-600 border border-rose-100/50'
                              : 'bg-amber-50 text-amber-600 border border-amber-100/50'
                          }`}>
                            {n.icon}
                          </div>

                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs font-bold text-slate-700 truncate">{n.title}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                n.category === 'Recall' ? 'bg-rose-50 text-rose-600' :
                                n.category === 'Expiry' ? 'bg-orange-50 text-orange-600' :
                                n.category === 'Cold Chain' ? 'bg-sky-50 text-sky-600' :
                                n.category === 'Safety Alert' ? 'bg-violet-50 text-violet-600' :
                                'bg-amber-50 text-amber-600'
                              }`}>
                                {n.category}
                              </span>
                            </div>
                            <p className="text-slate-500 text-[11px] leading-relaxed font-normal">{n.message}</p>
                          </div>

                          <button
                            onClick={(e) => dismissNotification(n.id, e)}
                            className="absolute right-3.5 top-3.5 w-6 h-6 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 grid place-items-center opacity-0 group-hover:opacity-100 transition duration-150 text-xs font-bold"
                            title="Dismiss"
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-center">
                    <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">Life Sciences Compliance Suite</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6" key={loc.pathname}>
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  )
}

function Bars() {
  return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
}
