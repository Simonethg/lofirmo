import type { CheckResult } from './analyze'
import type { RawTx } from './parse'

export interface CheckRequest {
  /** a payment link, an address, or `<to>:<calldata>` */
  input?: string
  /** an unsigned tx */
  tx?: RawTx
  network?: 'mainnet' | 'sepolia'
  /** what the payer expects to pay, in token units, e.g. "10" */
  expectedAmount?: string
}

export class PaymentRequired extends Error {
  constructor(public requirements: unknown) { super('402 Payment Required (x402)') }
}

/**
 * Call Vigía before sending a payment.
 *   const r = await checkPayment('https://<host>', { input: link, expectedAmount: '10' })
 *   if (r.verdict !== 'ok') showWarning(r.resumen, r.findings)
 * `xPayment` is an x402 X-PAYMENT header, when the server has x402 enabled.
 */
export async function checkPayment(baseUrl: string, req: CheckRequest, opts: { xPayment?: string; fetch?: typeof fetch } = {}): Promise<CheckResult> {
  const f = opts.fetch ?? fetch
  const r = await f(baseUrl.replace(/\/$/, '') + '/api/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(opts.xPayment ? { 'x-payment': opts.xPayment } : {}) },
    body: JSON.stringify(req),
  })
  const j = await r.json()
  if (r.status === 402) throw new PaymentRequired(j)
  if (!r.ok) throw new Error(j?.error ?? `Vigía error ${r.status}`)
  return j as CheckResult
}
