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

describe('x402 stub', () => {
  afterEach(() => { delete process.env.X402_ENABLED; delete process.env.X402_PAY_TO })
  it('open when disabled', () => {
    expect(gate(new Headers(), '/api/check').ok).toBe(true)
  })
  it('402 with requirements when enabled and unpaid', () => {
    process.env.X402_ENABLED = 'true'
    process.env.X402_PAY_TO = '0x3333333333333333333333333333333333333333'
    const g = gate(new Headers(), '/api/check')
    expect(g.ok).toBe(false)
    if (!g.ok) {
      expect(g.status).toBe(402)
      expect((g.body as { accepts: { network: string; payTo: string }[] }).accepts[0]).toMatchObject({ network: 'celo', payTo: '0x3333333333333333333333333333333333333333' })
    }
  })
  it('501 when enabled without payTo', () => {
    process.env.X402_ENABLED = 'true'
    const g = gate(new Headers(), '/api/check')
    expect(!g.ok && g.status).toBe(501)
  })
})
