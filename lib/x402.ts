import { X402 } from './config'

/**
 * x402 paywall STUB for /api/check, shaped for the Celo facilitator (x402.celo.org).
 * Config only: no keys. When X402_ENABLED=true and no X-PAYMENT header is present,
 * returns 402 + payment requirements. Real verification/settlement against the
 * facilitator (/verify, /settle) is TODO before mainnet.
 */
export const USDC_MAINNET = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'

export function paymentRequirements(resource: string) {
  const atomic = Math.round(Number(X402.priceUsd()) * 1e6).toString() // USDC, 6 decimals
  return {
    x402Version: 1,
    error: 'X-PAYMENT header is required',
    accepts: [
      {
        scheme: 'exact',
        network: X402.network(),
        maxAmountRequired: atomic,
        resource,
        description: '¿Lo firmo? pre-signing check',
        mimeType: 'application/json',
        payTo: X402.payTo(),
        maxTimeoutSeconds: 60,
        asset: USDC_MAINNET,
        extra: { name: 'USDC', version: '2', facilitator: X402.facilitatorUrl() },
      },
    ],
  }
}

export type Gate = { ok: true } | { ok: false; status: 402 | 501; body: unknown }

export function gate(headers: Headers, resource: string): Gate {
  if (!X402.enabled()) return { ok: true }
  if (!X402.payTo()) return { ok: false, status: 501, body: { error: 'x402 enabled but X402_PAY_TO is not configured' } }
  if (!headers.get('x-payment')) return { ok: false, status: 402, body: paymentRequirements(resource) }
  // TODO(mainnet): POST to `${facilitator}/verify` and `/settle` before serving.
  return { ok: false, status: 501, body: { error: 'x402 verification not implemented yet (stub)' } }
}
