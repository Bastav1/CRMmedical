// Trie-based global search engine for PharmaERP.
// Supports multi-word prefix search across all live data collections and nav pages.
// Each node stores matching result IDs; traversal is O(prefix_length) average.

class TrieNode {
  constructor() {
    this.children = {}
    this.results = [] // { id, type, label, sub, icon, link, score }
  }
}

export class SearchTrie {
  constructor() {
    this.root = new TrieNode()
  }

  // Insert a result document. Tokenises every word in `text` so searching
  // for any prefix of any word in the text finds this result.
  insert(text, result) {
    if (!text) return
    const words = String(text).toLowerCase().split(/[\s,./\-_]+/).filter(Boolean)
    const seen = new Set()
    for (const word of words) {
      if (seen.has(word)) continue
      seen.add(word)
      let node = this.root
      for (const ch of word) {
        if (!node.children[ch]) node.children[ch] = new TrieNode()
        node = node.children[ch]
        // Deduplicate results at each node (same id may come from multiple words)
        if (!node.results.find((r) => r.id === result.id)) {
          node.results.push(result)
        }
      }
    }
  }

  // Search for a prefix string. Returns top `limit` results sorted by score desc.
  search(prefix, limit = 8) {
    const q = prefix.toLowerCase().trim()
    if (!q) return []
    let node = this.root
    for (const ch of q) {
      if (!node.children[ch]) return []
      node = node.children[ch]
    }
    // Collect all results from this subtree (BFS)
    const collected = new Map()
    const queue = [node]
    while (queue.length) {
      const cur = queue.shift()
      for (const r of cur.results) {
        if (!collected.has(r.id)) {
          // Boost score if the label itself starts with q (more relevant)
          const labelLower = r.label.toLowerCase()
          const boost = labelLower.startsWith(q) ? 2 : labelLower.includes(q) ? 1 : 0
          collected.set(r.id, { ...r, score: (r.score || 0) + boost })
        }
      }
      for (const child of Object.values(cur.children)) queue.push(child)
    }
    return [...collected.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
}

// Build and return a populated trie from all collections + nav pages.
export function buildTrie(collections, nav) {
  const trie = new SearchTrie()

  // ---- Nav pages -------------------------------------------------------
  for (const section of nav) {
    for (const item of section.items) {
      const result = {
        id: `nav:${item.to}`,
        type: 'Page',
        label: item.label,
        sub: section.group,
        icon: item.icon,
        link: item.to,
        score: 0,
      }
      trie.insert(item.label, result)
      trie.insert(section.group, result)
    }
  }

  // ---- Products --------------------------------------------------------
  for (const p of collections.products || []) {
    const result = {
      id: `product:${p.id}`,
      type: 'Product',
      label: p.name,
      sub: `${p.brand} · ${p.category || ''} · ${p.molecule || ''}`,
      icon: '💊',
      link: '/products',
      score: 0,
    }
    trie.insert(p.name, result)
    trie.insert(p.brand, result)
    trie.insert(p.molecule, result)
    trie.insert(p.category, result)
    trie.insert(p.manufacturer, result)
    trie.insert(p.code, result)
  }

  // ---- Batches ---------------------------------------------------------
  for (const b of collections.batches || []) {
    const pName = (collections.products || []).find((p) => p.id === b.productId)?.name || ''
    const result = {
      id: `batch:${b.id}`,
      type: 'Batch',
      label: b.batchNo,
      sub: `${pName} · Qty: ${b.qty} · Exp: ${b.expiryDate?.slice(0, 10) || '—'}`,
      icon: '🏷️',
      link: '/batches',
      score: 0,
    }
    trie.insert(b.batchNo, result)
    trie.insert(pName, result)
  }

  // ---- Customers -------------------------------------------------------
  for (const c of collections.customers || []) {
    const result = {
      id: `customer:${c.id}`,
      type: 'Customer',
      label: c.name,
      sub: `${c.phone || ''} · ${c.address || ''}`,
      icon: '🧑',
      link: '/customers',
      score: 0,
    }
    trie.insert(c.name, result)
    trie.insert(c.phone, result)
    trie.insert(c.email, result)
    trie.insert(c.gstin, result)
  }

  // ---- Vendors ---------------------------------------------------------
  for (const v of collections.vendors || []) {
    const result = {
      id: `vendor:${v.id}`,
      type: 'Vendor',
      label: v.name,
      sub: `${v.phone || ''} · ${v.address || ''}`,
      icon: '🏭',
      link: '/vendors',
      score: 0,
    }
    trie.insert(v.name, result)
    trie.insert(v.phone, result)
    trie.insert(v.gstin, result)
    trie.insert(v.email, result)
  }

  // ---- Sales invoices --------------------------------------------------
  for (const s of collections.sales || []) {
    const result = {
      id: `sale:${s.id}`,
      type: 'Invoice',
      label: s.invoiceNo || s.id,
      sub: `${s.customerName || ''} · ${s.date?.slice(0, 10) || ''}`,
      icon: '🧾',
      link: '/sales',
      score: 0,
    }
    trie.insert(s.invoiceNo, result)
    trie.insert(s.customerName, result)
  }

  // ---- Purchase orders -------------------------------------------------
  for (const p of collections.purchases || []) {
    const result = {
      id: `purchase:${p.id}`,
      type: 'Purchase',
      label: p.billNo || p.id,
      sub: `${p.vendorName || ''} · ${p.date?.slice(0, 10) || ''}`,
      icon: '🛒',
      link: '/purchase',
      score: 0,
    }
    trie.insert(p.billNo, result)
    trie.insert(p.vendorName, result)
  }

  return trie
}
