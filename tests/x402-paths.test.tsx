import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CheckResult } from '@/lib/analyze'

const OK: CheckResult = {
  network: 'mainnet', chainId: 42220, verdict: 'ok', semaforo: 'verde', resumen: 'No problems found. You can sign.',
  intent: { tipo: 'transfer', token: 'USDC', monto: '10 USDC', destinatario: '0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2' },
  findings: [{ id: 'FEE', severity: 'info', titulo: 'fee', detalle: '' } as CheckResult['findings'][number]],
  fee: { amount: '0.0011', currency: 'USDC', gas: '60000' }, simulated: false,
}
const BAD: CheckResult = { ...OK, verdict: 'no_firmes', semaforo: 'rojo', resumen: "Don't sign it.", findings: [{ id: 'CELO-001', severity: 'critica', titulo: 'Wrong decimals', detalle: '18 vs 6' } as CheckResult['findings'][number]] }

const checkMock = vi.fn(async (input: string) => (input.includes('10e18') ? BAD : OK))
vi.mock('@/lib/analyze', () => ({ check: (input: string) => checkMock(input) }))

const LINK = 'ethereum:0xcebA9300f2b948710d2653dD7B07f33A8B32118C@42220/transfer?address=0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2&uint256=10e6'

function x402On() {
  process.env.X402_ENABLED = 'true'
  process.env.X402_NETWORK = 'celo'
  process.env.X402_PAY_TO = '0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2'
  process.env.X402_API_KEY = 'test'
}

describe('with x402 ON', () => {
  const realFetch = globalThis.fetch
  let fetchSpy: ReturnType<typeof vi.fn>
  beforeEach(() => { x402On(); fetchSpy = vi.fn(async () => { throw new Error('no network in tests') }); globalThis.fetch = fetchSpy as never; checkMock.mockClear() })
  afterEach(() => { globalThis.fetch = realFetch; for (const k of ['X402_ENABLED', 'X402_NETWORK', 'X402_PAY_TO', 'X402_API_KEY']) delete process.env[k] })

  it('/pay renders the verdict server-side, without paying and without calling /api/check', async () => {
    const { default: PayPage } = await import('@/app/pay/page')
    const html = renderToStaticMarkup(await PayPage({ searchParams: Promise.resolve({ link: LINK, amount: '10' }) }))
    expect(html).toContain('Checked by Vigía')
    expect(html).toContain('No problems found. You can sign.')
    expect(html).toContain('Pay 10 USDC')
    expect(html).not.toMatch(/402|Payment Required/)
    expect(checkMock).toHaveBeenCalledWith(LINK)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('/pay shows the warning and no pay button for a bad link', async () => {
    const { default: PayPage } = await import('@/app/pay/page')
    const html = renderToStaticMarkup(await PayPage({ searchParams: Promise.resolve({ link: LINK.replace('10e6', '10e18'), amount: '10' }) }))
    expect(html).toContain("Don&#x27;t sign it.")
    expect(html).toContain('CELO-001')
    expect(html).not.toContain('Pay 10 USDC')
  })

  it('/pay without a link explains how it opens', async () => {
    const { default: PayPage } = await import('@/app/pay/page')
    const html = renderToStaticMarkup(await PayPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('/pay?link=')
    expect(checkMock).not.toHaveBeenCalled()
  })

  it('POST /api/check without payment still returns 402 with mainnet requirements and does not analyze', async () => {
    const { POST } = await import('@/app/api/check/route')
    const res = await POST(new Request('http://localhost/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: LINK, expectedAmount: '10' }) }))
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.error).toBe('X-PAYMENT header is required')
    expect(body.accepts[0]).toMatchObject({ network: 'celo', maxAmountRequired: '10000', asset: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', payTo: '0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2' })
    expect(checkMock).not.toHaveBeenCalled()
  })

  it('GET /api/check without payment also returns 402', async () => {
    const { GET } = await import('@/app/api/check/route')
    const res = await GET(new Request(`http://localhost/api/check?input=${encodeURIComponent(LINK)}`))
    expect(res.status).toBe(402)
    expect(checkMock).not.toHaveBeenCalled()
  })
})
