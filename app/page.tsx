'use client'
import { useEffect, useState } from 'react'
import type { CheckResult } from '@/lib/analyze'
import { connectedAddress, isMiniPay, scanQr } from '@/lib/wallet'

const NETWORK = process.env.NEXT_PUBLIC_CELO_NETWORK === 'mainnet' ? 'mainnet' : 'sepolia'

export default function Home() {
  const [input, setInput] = useState('')
  const [expected, setExpected] = useState('')
  const [from, setFrom] = useState<string>()
  const [minipay, setMinipay] = useState(false)
  const [res, setRes] = useState<CheckResult>()
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setMinipay(isMiniPay())
    if (isMiniPay()) connectedAddress().then(setFrom).catch(() => {})
  }, [])

  async function run(value = input) {
    setBusy(true); setErr(undefined); setRes(undefined)
    try {
      const s = value.trim()
      const body = from && s.startsWith('{') ? { tx: { from, ...JSON.parse(s) }, network: NETWORK, expectedAmount: expected || undefined } : { input: s, network: NETWORK, expectedAmount: expected || undefined }
      const r = await fetch('/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`)
      setRes(j)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function onScan() {
    const t = await scanQr()
    if (t) { setInput(t); run(t) } else setErr('Escanear QR solo funciona dentro de MiniPay. Pegá el link a mano.')
  }

  return (
    <main>
      <h1>¿Lo firmo?</h1>
      <p className="small">Pegá una dirección, un link de pago o escaneá un QR. Te decimos si es seguro antes de pagar. Red: {NETWORK === 'mainnet' ? 'Celo' : 'Celo Sepolia (pruebas)'}{minipay ? ' · MiniPay conectado' : ''}</p>
      <textarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x… · ethereum:0xToken@11142220/transfer?address=0x…&uint256=1e6" />
      <input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="¿Cuánto esperás pagar? (opcional, ej. 10)" inputMode="decimal" style={{ marginTop: 8 }} />
      <button disabled={busy || !input.trim()} onClick={() => run()}>{busy ? 'Revisando…' : 'Revisar'}</button>
      <button className="secondary" onClick={onScan}>Escanear QR</button>
      {err && <div className="card rojo">{err}</div>}
      {res && (
        <>
          <div className={`card ${res.semaforo}`}>
            <strong style={{ fontSize: 20 }}>{res.resumen}</strong>
            <div className="small">{Object.entries(res.intent).filter(([, v]) => v).map(([k, v]) => <div key={k}>{k}: {v}</div>)}</div>
          </div>
          {res.findings.map((f, i) => (
            <div key={i} className={`card ${f.severity === 'critica' ? 'rojo' : f.severity === 'info' ? 'verde' : 'amarillo'}`}>
              <div className="sev">{f.severity} · {f.id}</div>
              <strong>{f.titulo}</strong>
              <div className="small">{f.detalle}</div>
            </div>
          ))}
        </>
      )}
      <p className="small" style={{ marginTop: 24 }}>Código abierto (MIT). No guardamos nada ni pedimos firmas.</p>
    </main>
  )
}
