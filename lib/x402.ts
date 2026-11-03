import { X402 } from './config'

/**
 * x402 paywall for /api/check against the Celo facilitator (x402 v1 wire format,
 * networks `celo-sepolia` / `celo`). Flow: no X-PAYMENT -> 402 + requirements;
 * X-PAYMENT -> facilitator /verify then /settle (X-API-Key) -> serve.
 */
export const USDC_MAINNET = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'
export const USDC_SEPOLIA = '0x01C5C0122039549AD1493B8220cABEdD739BC44E'
/** Tether USD₮ and USA₮ on Celo mainnet (docs.celo.org fee-currencies; both listed as eip3009 in api.x402.celo.org/supported). */
export const USDT_MAINNET = '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e'
export const USAT_MAINNET = '0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771'

type Asset = { asset: string; name: string; version: string }
/** EIP-712 domain name/version must match each token contract, or the facilitator rejects the signature. All are 6 decimals. */
export function acceptedAssets(net: string): Asset[] {
  if (net !== 'celo') return [{ asset: USDC_SEPOLIA, name: 'USDC', version: '2' }]
  return [
    { asset: USDC_MAINNET, name: 'USDC', version: '2' },
    { asset: USDT_MAINNET, name: 'Tether USD', version: '1' },
    { asset: USAT_MAINNET, name: 'Tether America USD', version: '1' },
  ]
}

export function allPaymentRequirements(resource: string) {
  const atomic = Math.round(Number(X402.priceUsd()) * 1e6).toString() // 6-decimal stablecoins
  const net = X402.network()
  return acceptedAssets(net).map((a) => ({
    scheme: 'exact',
    network: net,
    maxAmountRequired: atomic,
    resource,
    description: 'Vigía pre-signing check',
    mimeType: 'application/json',
    payTo: X402.payTo(),
    maxTimeoutSeconds: 60,
    asset: a.asset,
    extra: { name: a.name, version: a.version },
  }))
}

/** First (default, USDC) requirement; kept for callers that expect a single one. */
export function paymentRequirements(resource: string) {
  return allPaymentRequirements(resource)[0]
}

export function requirementsBody(resource: string) {
  return { x402Version: 1, error: 'X-PAYMENT header is required', accepts: allPaymentRequirements(resource) }
}

/**
 * The v1 payload does not name the token. Use an explicit `asset` hint if the client sent one
 * (top level or `accepted.asset`); otherwise try each accepted token, since the EIP-712 signature
 * only verifies against the token it was signed for.
 */
function candidates(payload: unknown, all: ReturnType<typeof allPaymentRequirements>) {
  const p = (payload ?? {}) as { asset?: unknown; accepted?: { asset?: unknown } }
  const hint = typeof p.asset === 'string' ? p.asset : typeof p.accepted?.asset === 'string' ? p.accepted.asset : undefined
  if (!hint) return all
  const m = all.filter((r) => r.asset.toLowerCase() === hint.toLowerCase())
  return m.length ? m : all
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
  try {
    let v: Awaited<ReturnType<typeof post>> | undefined
    let req: { x402Version: number; paymentPayload: unknown; paymentRequirements: unknown } | undefined
    for (const r of candidates(paymentPayload, allPaymentRequirements(resource))) {
      req = { x402Version: 1, paymentPayload, paymentRequirements: r }
      v = await post(f, '/verify', req)
      if (v.ok && v.j.isValid === true) break
    }
    if (!v || !req || !v.ok || v.j.isValid !== true) return { ok: false, status: 402, body: { ...requirementsBody(resource), error: `payment invalid: ${String(v?.j.invalidReason ?? 'verify failed')}` } }
    const s = await post(f, '/settle', req, { 'x-idempotency-key': crypto.randomUUID() })
    if (!s.ok || s.j.success !== true) return { ok: false, status: 402, body: { ...requirementsBody(resource), error: `settlement failed: ${String(s.j.errorReason ?? 'settle failed')}` } }
    return { ok: true, settlement: s.j }
  } catch (e) {
    return { ok: false, status: 402, body: { ...requirementsBody(resource), error: `facilitator unreachable: ${(e as Error).message}` } }
  }
}
