import { X402 } from './config'

/**
 * x402 paywall for /api/check against the Celo facilitator (x402 v1 wire format,
 * networks `celo-sepolia` / `celo`). Flow: no X-PAYMENT -> 402 + requirements;
 * X-PAYMENT -> facilitator /verify then /settle (X-API-Key) -> serve.
 */
export const USDC_MAINNET = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'
export const USDC_SEPOLIA = '0x01C5C0122039549AD1493B8220cABEdD739BC44E'

export function paymentRequirements(resource: string) {
  const atomic = Math.round(Number(X402.priceUsd()) * 1e6).toString() // USDC, 6 decimals
  const net = X402.network()
  return {
    scheme: 'exact',
    network: net,
    maxAmountRequired: atomic,
    resource,
    description: 'Vigía pre-signing check',
    mimeType: 'application/json',
    payTo: X402.payTo(),
    maxTimeoutSeconds: 60,
    asset: net === 'celo' ? USDC_MAINNET : USDC_SEPOLIA,
    extra: { name: 'USDC', version: '2' },
  }
}

export function requirementsBody(resource: string) {
  return { x402Version: 1, error: 'X-PAYMENT header is required', accepts: [paymentRequirements(resource)] }
}

export type Gate = { ok: true; settlement?: unknown } | { ok: false; status: 402 | 501; body: unknown }

type Fetch = typeof fetch

async function post(f: Fetch, path: string, body: unknown, extra: Record<string, string> = {}) {
  const r = await f(`${X402.facilitatorUrl()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': X402.apiKey(), ...extra },
    body: JSON.stringify(body),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: r.ok, j }
}

export async function gate(headers: Headers, resource: string, f: Fetch = fetch): Promise<Gate> {
  if (!X402.enabled()) return { ok: true }
  if (!X402.payTo() || !X402.apiKey()) return { ok: false, status: 501, body: { error: 'x402 enabled but X402_PAY_TO / X402_API_KEY not configured' } }
  const header = headers.get('x-payment')
  if (!header) return { ok: false, status: 402, body: requirementsBody(resource) }
  let paymentPayload: unknown
  try {
    paymentPayload = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
  } catch {
    return { ok: false, status: 402, body: { ...requirementsBody(resource), error: 'X-PAYMENT is not valid base64 JSON' } }
  }
  const req = { x402Version: 1, paymentPayload, paymentRequirements: paymentRequirements(resource) }
  try {
    const v = await post(f, '/verify', req)
    if (!v.ok || v.j.isValid !== true) return { ok: false, status: 402, body: { ...requirementsBody(resource), error: `payment invalid: ${String(v.j.invalidReason ?? 'verify failed')}` } }
    const s = await post(f, '/settle', req, { 'x-idempotency-key': crypto.randomUUID() })
    if (!s.ok || s.j.success !== true) return { ok: false, status: 402, body: { ...requirementsBody(resource), error: `settlement failed: ${String(s.j.errorReason ?? 'settle failed')}` } }
    return { ok: true, settlement: s.j }
  } catch (e) {
    return { ok: false, status: 402, body: { ...requirementsBody(resource), error: `facilitator unreachable: ${(e as Error).message}` } }
  }
}
