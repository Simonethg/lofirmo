'use client'
import { useEffect, useState } from 'react'
import type { CheckResult } from '@/lib/analyze'
import { connectedAddress, isMiniPay, scanQr } from '@/lib/wallet'

const SEV: Record<string, string> = { critica: 'Critical', alta: 'High', media: 'Medium', info: 'Info' }

const LABEL: Record<string, string> = { tipo: 'type', token: 'token', monto: 'amount', destinatario: 'recipient', spender: 'spender' }

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
    if (t) { setInput(t); run(t) } else setErr('QR scanning only works inside MiniPay. Paste the link instead.')
  }

  return (
    <main>
      <h1 className="brand"><img src="/vigia-logo.svg" alt="Vigía" width={138} height={58} /></h1>
      <p className="small">Paste an address or a payment link, or scan a QR. We tell you if it's safe before you pay. Network: {NETWORK === 'mainnet' ? 'Celo' : 'Celo Sepolia (testnet)'}{minipay ? ' · MiniPay connected' : ''}</p>
      <textarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x… · ethereum:0xToken@11142220/transfer?address=0x…&uint256=1e6" />
      <input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="How much do you expect to pay? (optional, e.g. 10)" inputMode="decimal" style={{ marginTop: 8 }} />
      <button disabled={busy || !input.trim()} onClick={() => run()}>{busy ? 'Checking…' : 'Check'}</button>
      <button className="secondary" onClick={onScan}>Scan QR</button>
      {err && <div className="card rojo">{err}</div>}
      {res && (
        <>
          <div className={`card ${res.semaforo}`}>
            <strong style={{ fontSize: 20 }}>{res.resumen}</strong>
            <div className="small">{Object.entries(res.intent).filter(([, v]) => v).map(([k, v]) => <div key={k}>{LABEL[k] ?? k}: {v}</div>)}</div>
          </div>
          {res.findings.map((f, i) => (
            <div key={i} className={`card ${f.severity === 'critica' ? 'rojo' : f.severity === 'info' ? 'verde' : 'amarillo'}`}>
              <div className="sev">{SEV[f.severity] ?? f.severity} · {f.id}</div>
              <strong>{f.titulo}</strong>
              <div className="small">{f.detalle}</div>
            </div>
          ))}
        </>
      )}
      <p className="small" style={{ marginTop: 24 }}>Open source (MIT). We store nothing and never ask you to sign.</p>
    </main>
  )
}
