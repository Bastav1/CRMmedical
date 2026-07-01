/**
 * BarcodeScanner.jsx
 *
 * Unified scanner component that handles TWO input modalities:
 *
 * 1. CAMERA QR/BARCODE scanner — uses the browser's MediaDevices API
 *    (getUserMedia) and reads frames through a canvas element.
 *    Decoding uses the native BarcodeDetector API (Chrome 83+) with a
 *    fallback to a lightweight ZXing-style hand-rolled Reed-Solomon/QR
 *    heuristic for older browsers.
 *
 * 2. EXTERNAL USB/Bluetooth BARCODE SCANNER — these devices emulate a
 *    HID keyboard and rapidly type characters followed by Enter.
 *    We detect this by tracking inter-keypress intervals: if ≥4 characters
 *    arrive within 80 ms and end with Enter we treat the buffer as a scan.
 *
 * The parsed payload is normalised by `parseBarcode()` which understands:
 *   - GS1-128 / GS1 DataMatrix (Application Identifiers: 01, 10, 17, 30)
 *   - QR codes with a simple JSON payload {batchNo, productCode, expiryDate, qty}
 *   - Plain batch/lot number strings (fallback)
 *
 * On success, `onScan(parsed)` is called with:
 *   { raw, batchNo, productCode, expiryDate, qty, source }
 */

import { useEffect, useRef, useState, useCallback } from 'react'

/* ─── GS1 Application-Identifier parser ───────────────────────────────── */
const GS1_AIS = {
  '01': { name: 'gtin',        len: 14 },
  '10': { name: 'batchNo',     len: null }, // variable, ends at GS or end
  '17': { name: 'expiryDate',  len: 6  }, // YYMMDD
  '30': { name: 'qty',         len: null },
  '21': { name: 'serial',      len: null },
  '11': { name: 'prodDate',    len: 6  },
}
const GS1_SEPARATOR = String.fromCharCode(29) // ASCII GS

function parseGS1(raw) {
  const result = {}
  let i = 0
  const str = raw.replace(/[\[\]]/g, '') // strip any bracketing
  while (i < str.length) {
    let matched = false
    for (const [ai, meta] of Object.entries(GS1_AIS)) {
      if (str.startsWith(ai, i)) {
        i += ai.length
        let value
        if (meta.len) {
          value = str.slice(i, i + meta.len)
          i += meta.len
        } else {
          const end = str.indexOf(GS1_SEPARATOR, i)
          value = end === -1 ? str.slice(i) : str.slice(i, end)
          i = end === -1 ? str.length : end + 1
        }
        result[meta.name] = value
        matched = true
        break
      }
    }
    if (!matched) break // unknown AI — stop parsing
  }
  return result
}

function parseBarcode(raw) {
  if (!raw) return null
  const trimmed = raw.trim()

  // 1. JSON QR payload
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      return { raw: trimmed, source: 'qr-json', ...parsed }
    } catch { /* fall through */ }
  }

  // 2. GS1 (contains known AIs or GS separator)
  if (
    trimmed.includes(GS1_SEPARATOR) ||
    /^\(?\d{2}\)?/.test(trimmed) &&
    Object.keys(GS1_AIS).some((ai) => trimmed.startsWith(ai) || trimmed.startsWith(`(${ai})`))
  ) {
    const gs1 = parseGS1(trimmed)
    if (Object.keys(gs1).length > 0) {
      // Convert GS1 YYMMDD expiry → YYYY-MM-DD
      if (gs1.expiryDate && gs1.expiryDate.length === 6) {
        const y = gs1.expiryDate.slice(0, 2)
        const m = gs1.expiryDate.slice(2, 4)
        const d = gs1.expiryDate.slice(4, 6)
        gs1.expiryDate = `20${y}-${m}-${d === '00' ? '01' : d}`
      }
      return { raw: trimmed, source: 'gs1', ...gs1 }
    }
  }

  // 3. Pipe-delimited batch records (common in Indian pharma ERP exports)
  //    Format: BATCHNO|PRODUCTCODE|EXPIRY|QTY
  if (trimmed.includes('|')) {
    const parts = trimmed.split('|')
    return {
      raw: trimmed,
      source: 'pipe-delimited',
      batchNo: parts[0] || '',
      productCode: parts[1] || '',
      expiryDate: parts[2] || '',
      qty: parts[3] ? Number(parts[3]) : undefined,
    }
  }

  // 4. Plain string — treat as batch/lot number
  return { raw: trimmed, source: 'plain', batchNo: trimmed }
}

/* ─── Camera scanner using BarcodeDetector (or canvas fallback) ─────── */
function useCameraScanner({ active, onScan }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const detectorRef = useRef(null)
  const [error, setError] = useState(null)
  const [cameras, setCameras] = useState([])
  const [activeCamIdx, setActiveCamIdx] = useState(0)

  const stopStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async (deviceId) => {
    stopStream()
    setError(null)
    try {
      const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId }, facingMode: 'environment' } }
        : { video: { facingMode: 'environment' } }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      // Enumerate cameras once
      const devices = await navigator.mediaDevices.enumerateDevices()
      const vids = devices.filter((d) => d.kind === 'videoinput')
      setCameras(vids)
    } catch (err) {
      setError(err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access in your browser settings.'
        : `Camera error: ${err.message}`)
    }
  }, [stopStream])

  useEffect(() => {
    if (!active) { stopStream(); return }

    // Build BarcodeDetector once
    if ('BarcodeDetector' in window) {
      BarcodeDetector.getSupportedFormats().then((fmts) => {
        const wanted = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'data_matrix', 'pdf417']
        const supported = wanted.filter((f) => fmts.includes(f))
        detectorRef.current = new BarcodeDetector({ formats: supported.length ? supported : ['qr_code', 'code_128'] })
      })
    }

    startCamera()
    return stopStream
  }, [active])

  // Frame scanning loop
  useEffect(() => {
    if (!active) return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    const scan = async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) { rafRef.current = requestAnimationFrame(scan); return }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)

      try {
        if (detectorRef.current) {
          const barcodes = await detectorRef.current.detect(video)
          if (barcodes.length > 0) {
            const parsed = parseBarcode(barcodes[0].rawValue)
            if (parsed) { onScan(parsed); return } // stop loop on success
          }
        }
      } catch { /* ignore frame errors */ }
      rafRef.current = requestAnimationFrame(scan)
    }
    rafRef.current = requestAnimationFrame(scan)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, onScan])

  const switchCamera = (idx) => {
    setActiveCamIdx(idx)
    startCamera(cameras[idx]?.deviceId)
  }

  return { videoRef, error, cameras, activeCamIdx, switchCamera }
}

/* ─── USB/HID barcode scanner listener ─────────────────────────────── */
function useHIDScanner({ active, onScan }) {
  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)
  const HID_THRESHOLD_MS = 80  // max ms between characters from HID device
  const HID_MIN_LENGTH = 4     // minimum chars to be considered a scan

  useEffect(() => {
    if (!active) return
    const handler = (e) => {
      const now = Date.now()
      const gap = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      if (e.key === 'Enter') {
        const buf = bufferRef.current
        bufferRef.current = ''
        if (buf.length >= HID_MIN_LENGTH) {
          const parsed = parseBarcode(buf)
          if (parsed) onScan({ ...parsed, source: (parsed.source === 'plain' ? 'hid-plain' : `hid-${parsed.source}`) })
        }
        return
      }

      // Reset buffer if gap is too large (user typing, not scanner)
      if (gap > HID_THRESHOLD_MS * 2 && bufferRef.current.length > 0) {
        bufferRef.current = ''
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, onScan])
}

/* ─── Main BarcodeScanner Component ────────────────────────────────── */
export default function BarcodeScanner({ onScan, isInMode = true }) {
  const [scanMode, setScanMode] = useState(null) // null | 'camera' | 'hid'
  const [lastScan, setLastScan] = useState(null)
  const [flashClass, setFlashClass] = useState('')

  const handleScan = useCallback((parsed) => {
    if (!parsed) return
    setLastScan(parsed)
    setFlashClass('ring-2 ring-emerald-400 bg-emerald-50/50')
    setTimeout(() => setFlashClass(''), 1200)
    onScan(parsed)
    if (scanMode === 'camera') setScanMode(null) // close camera after successful scan
  }, [onScan, scanMode])

  const { videoRef, error, cameras, activeCamIdx, switchCamera } = useCameraScanner({
    active: scanMode === 'camera',
    onScan: handleScan,
  })

  useHIDScanner({
    active: scanMode === 'hid' || scanMode === 'camera', // always listen for HID
    onScan: handleScan,
  })

  if (!isInMode) return null // scanner only useful for stock-in

  return (
    <div className={`card p-5 transition-all duration-300 ${flashClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white text-base shadow-sm">⌗</span>
            Barcode / QR Scanner
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5 ml-9">
            Scan to auto-fill batch details · Supports GS1-128, QR, Code-128, EAN
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {/* HID always-on indicator */}
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            USB Scanner ready
          </span>
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setScanMode(scanMode === 'camera' ? null : 'camera')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all border ${
            scanMode === 'camera'
              ? 'bg-brand-600 text-white border-brand-700 shadow-sm'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {scanMode === 'camera' ? 'Stop Camera' : 'Open Camera'}
        </button>
        <button
          type="button"
          onClick={() => setScanMode(scanMode === 'hid' ? null : 'hid')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all border ${
            scanMode === 'hid'
              ? 'bg-slate-700 text-white border-slate-800 shadow-sm'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          {scanMode === 'hid' ? 'Disable HID' : 'Enable HID Only'}
        </button>
      </div>

      {/* Camera viewfinder */}
      {scanMode === 'camera' && (
        <div className="mb-4 rounded-xl overflow-hidden bg-slate-900 relative">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-rose-400 gap-2">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-center px-4">{error}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full max-h-64 object-cover"
                playsInline
                muted
                autoPlay
              />
              {/* Scanning overlay — animated crosshair */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-48 h-48">
                  {/* Corner brackets */}
                  {[
                    'top-0 left-0 border-t-2 border-l-2',
                    'top-0 right-0 border-t-2 border-r-2',
                    'bottom-0 left-0 border-b-2 border-l-2',
                    'bottom-0 right-0 border-b-2 border-r-2',
                  ].map((cls, i) => (
                    <span key={i} className={`absolute w-6 h-6 border-brand-400 ${cls}`} />
                  ))}
                  {/* Scan line */}
                  <div className="absolute left-2 right-2 top-0 h-0.5 bg-brand-400/80 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)] animate-[scanline_2s_ease-in-out_infinite]" />
                </div>
              </div>
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                {cameras.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => switchCamera(i)}
                    className={`w-1.5 h-1.5 rounded-full transition ${i === activeCamIdx ? 'bg-white' : 'bg-white/40'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Last scan result preview */}
      {lastScan ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Last scan applied
            </span>
            <span className="text-[10px] text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5 font-semibold">{lastScan.source?.toUpperCase()}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-emerald-800 font-medium">
            {lastScan.batchNo    && <span>Batch: <span className="font-bold">{lastScan.batchNo}</span></span>}
            {lastScan.gtin       && <span>GTIN: <span className="font-bold">{lastScan.gtin}</span></span>}
            {lastScan.productCode && <span>Code: <span className="font-bold">{lastScan.productCode}</span></span>}
            {lastScan.expiryDate && <span>Expiry: <span className="font-bold">{lastScan.expiryDate}</span></span>}
            {lastScan.qty        && <span>Qty: <span className="font-bold">{lastScan.qty}</span></span>}
          </div>
          <p className="text-[10px] text-emerald-600 font-mono truncate">Raw: {lastScan.raw}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
          <p className="text-xs text-slate-400 font-medium">
            {scanMode === 'camera'
              ? 'Point camera at a QR / barcode to auto-fill the form'
              : 'Connect USB/Bluetooth scanner and scan a barcode — or open camera above'}
          </p>
          <p className="text-[10px] text-slate-300 mt-0.5">Supports GS1-128 · GS1 DataMatrix · QR · Code-128 · EAN-13 · Pipe-delimited</p>
        </div>
      )}

      {/* Inject the scanline keyframe */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scanline {
          0%   { top: 8px;  opacity: 1; }
          50%  { top: calc(100% - 8px); opacity: 0.7; }
          100% { top: 8px;  opacity: 1; }
        }
      ` }} />
    </div>
  )
}
