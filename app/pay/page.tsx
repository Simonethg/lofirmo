'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { CheckResult } from '@/lib/analyze'
import { checkPayment } from '@/lib/client'
import { payGate, payTx, readPayParams } from '@/lib/pay'
import { connectedAddress, isMiniPay, walletClient } from '@/lib/wallet'

const NETWORK = process.env.NEXT_PUBLIC_CELO_NETWORK === 'mainnet' ? 'mainnet' : 'sepolia'
const SEV: Record<string, string> = { critica: 'Critical', alta: 'High', media: 'Medium', info: 'Info' }
const LABEL: Record<string, string> = { tipo: 'type', token: 'token', monto: 'amount', destinatario: 'recipient', spender: 'spender' }

function Pay() {
  const q = useSearchParams()
  const [res, setRes] = useState<CheckResult>()
  const [err, setErr] = useState<string>()
  const [sent, setSent] = useState<string>()
  const [paying, setPaying] = useState(false)
  const [anyway, setAnyway] = useState(false)
  const parsed = useMemo(() => { try { return { params: readPayParams(new URLSearchParams(q.toString())) } } catch (e) { return { error: (e as Error).message } } }, [q])
  const params = parsed.params

  useEffect(() => {
    if (!params) { setErr(parsed.error); return }
    checkPayment(window.location.origin, { input: params.link, network: NETWORK, expectedAmount: params.expectedAmount })
      .then(setRes).catch((e) => setErr((e as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  async function pay() {
    if (!params) return
    setPaying(true); setErr(undefined)
    try {
      if (!isMiniPay()) throw new Error('Open this link inside MiniPay to pay.')
      const from = await connectedAddress()
      if (!from) throw new Error('No MiniPay account connected')
      const hash = await walletClient(NETWORK).sendTransaction({ account: from as `0x${string}`, ...payTx(params.link, NETWORK) })
      setSent(hash)
    } catch (e) { setErr((e as Error).message) } finally { setPaying(false) }
  }

  const g = res && payGate(res)
  const amount = res?.intent.monto
  return (
    <main>
      <h1 className="brand"><img src="/vigia-logo.svg" alt="Vigía" width={138} height={58} /></h1>
      {!res && !err && <div className="card"><strong>Checking this payment…</strong><div className="small">Vigía checks every payment link before you can pay.</div></div>}
      {res && (
        <>
          <div className={`card ${res.semaforo}`}>
            <div className="sev">{g === 'pay' ? 'Checked by Vigía' : 'Warning'}</div>
            <strong style={{ fontSize: 20 }}>{res.resumen}</strong>
            <div className="small">{Object.entries(res.intent).filter(([, v]) => v).map(([k, v]) => <div key={k}>{LABEL[k] ?? k}: {v}</div>)}</div>
          </div>
          {g !== 'pay' && res.findings.filter((f) => f.severity !== 'info').map((f, i) => (
            <div key={i} className={`card ${f.severity === 'critica' ? 'rojo' : 'amarillo'}`}>
              <div className="sev">{SEV[f.severity] ?? f.severity} · {f.id}</div>
              <strong>{f.titulo}</strong>
              <div className="small">{f.detalle}</div>
            </div>
          ))}
          {g === 'pay' && !sent && <button disabled={paying} onClick={pay}>{paying ? 'Opening MiniPay…' : `Pay ${amount ?? ''}`.trim()}</button>}
          {g === 'warn' && !sent && (anyway
            ? <button disabled={paying} onClick={pay}>{`Pay ${amount ?? ''} anyway`.trim()}</button>
            : <button className="secondary" onClick={() => setAnyway(true)}>I know this recipient</button>)}
          {g === 'block' && <p className="small">There is no pay button for this link. Ask the sender for a new one.</p>}
          {res.fee && g === 'pay' && <p className="small">Network fee ~{res.fee.amount} {res.fee.currency}. Network: {NETWORK === 'mainnet' ? 'Celo' : 'Celo Sepolia (testnet)'}</p>}
        </>
      )}
      {sent && <div className="card verde"><strong>Sent.</strong><div className="small">{sent}</div></div>}
      {err && <div className="card rojo">{err}</div>}
    </main>
  )
}

export default function PayPage() {
  return <Suspense fallback={<main><div className="card">Checking this payment…</div></main>}><Pay /></Suspense>
}
