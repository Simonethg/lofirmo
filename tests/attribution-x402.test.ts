import { describe, expect, it, afterEach } from 'vitest'
import { withAttribution, fromDataSuffix } from '@celo/attribution-tags'
import { createWalletClient, custom, type Hex } from 'viem'
import { celoSepolia } from 'viem/chains'
import { ATTRIBUTION_TAG } from '@/lib/config'
import { gate } from '@/lib/x402'

describe('attribution', () => {
  it('every tx from the extended client carries the hackathon tag', async () => {
    const sent: Hex[] = []
    const provider = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === 'eth_chainId') return '0x' + celoSepolia.id.toString(16)
        if (method === 'eth_sendTransaction') { sent.push((params![0] as { data: Hex }).data); return '0x' + '00'.repeat(32) }
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111']
        throw new Error('unexpected ' + method)
      },
    }
    const w = createWalletClient({ chain: celoSepolia, transport: custom(provider), account: '0x1111111111111111111111111111111111111111' }).extend(withAttribution(ATTRIBUTION_TAG))
    await w.sendTransaction({ to: '0x2222222222222222222222222222222222222222', value: 1n, gas: 21000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, nonce: 0 })
    await w.sendTransaction({ to: '0x2222222222222222222222222222222222222222', data: '0xa9059cbb', gas: 60000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, nonce: 1 })
    expect(sent).toHaveLength(2)
    for (const d of sent) expect(fromDataSuffix(d)?.codes).toContain(ATTRIBUTION_TAG)
  })
})

describe('x402 gate', () => {
  afterEach(() => { for (const k of ['X402_ENABLED', 'X402_PAY_TO', 'X402_API_KEY']) delete process.env[k] })
  const on = () => { process.env.X402_ENABLED = 'true'; process.env.X402_PAY_TO = '0x3333333333333333333333333333333333333333'; process.env.X402_API_KEY = 'test' }
  const hdr = () => new Headers({ 'x-payment': Buffer.from(JSON.stringify({ x402Version: 1, scheme: 'exact', network: 'celo-sepolia', payload: {} })).toString('base64') })
  const mock = (verify: object, settle: object) => {
    const calls: string[] = []
    const f = (async (url: string, init: RequestInit) => {
      calls.push(url)
      expect((init.headers as Record<string, string>)['x-api-key']).toBe('test')
      return new Response(JSON.stringify(url.endsWith('/verify') ? verify : settle))
    }) as unknown as typeof fetch
    return { f, calls }
  }
  it('open when disabled', async () => {
    expect((await gate(new Headers(), '/api/check')).ok).toBe(true)
  })
  it('402 with testnet requirements when enabled and unpaid', async () => {
    on()
    const g = await gate(new Headers(), '/api/check')
    expect(!g.ok && g.status).toBe(402)
    if (!g.ok) expect((g.body as { accepts: object[] }).accepts[0]).toMatchObject({ network: 'celo-sepolia', asset: '0x01C5C0122039549AD1493B8220cABEdD739BC44E', payTo: '0x3333333333333333333333333333333333333333', maxAmountRequired: '10000' })
  })
  it('501 when enabled without config', async () => {
    process.env.X402_ENABLED = 'true'
    const g = await gate(new Headers(), '/api/check')
    expect(!g.ok && g.status).toBe(501)
  })
  it('verifies then settles a payment', async () => {
    on()
    const { f, calls } = mock({ isValid: true }, { success: true, transaction: '0xabc', network: 'celo-sepolia' })
    const g = await gate(hdr(), '/api/check', f)
    expect(g.ok).toBe(true)
    expect(calls.map((c) => c.split('/').pop())).toEqual(['verify', 'settle'])
  })
  it('rejects an invalid payment without settling', async () => {
    on()
    const { f, calls } = mock({ isValid: false, invalidReason: 'insufficient_funds' }, {})
    const g = await gate(hdr(), '/api/check', f)
    expect(!g.ok && g.status).toBe(402)
    expect(calls).toHaveLength(1)
  })
})

describe('server wallet key handling', () => {
  it('normalizes keys with or without 0x and rejects bad ones', async () => {
    const { normalizeKey } = await import('@/lib/serverWallet')
    const k = 'ab'.repeat(32)
    expect(normalizeKey(k)).toBe('0x' + k)
    expect(normalizeKey('0x' + k)).toBe('0x' + k)
    expect(() => normalizeKey('')).toThrow()
    expect(() => normalizeKey('0x123')).toThrow(/malformed/)
  })
})
