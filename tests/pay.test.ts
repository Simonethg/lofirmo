import { describe, expect, it } from 'vitest'
import { decodeFunctionData, erc20Abi } from 'viem'
import { payGate, payTx, readPayParams } from '@/lib/pay'
import { checkPayment, PaymentRequired } from '@/lib/client'

const TOK = '0x01C5C0122039549AD1493B8220cABEdD739BC44E'
const DEST = '0x2222222222222222222222222222222222222222'
const link = (amt: string) => `ethereum:${TOK}@11142220/transfer?address=${DEST}&uint256=${amt}`

describe('/pay deep link', () => {
  it('reads the link and expected amount from the URL, no paste step', () => {
    const q = new URLSearchParams({ link: link('10e6'), amount: '10' })
    expect(readPayParams(q)).toEqual({ link: link('10e6'), expectedAmount: '10' })
    expect(readPayParams(new URLSearchParams({ uri: link('1') })).expectedAmount).toBeUndefined()
  })
  it('refuses to open without a link', () => {
    expect(() => readPayParams(new URLSearchParams())).toThrow(/payment link/)
  })
  it('only an ok verdict shows the pay button', () => {
    expect(payGate({ verdict: 'ok' })).toBe('pay')
    expect(payGate({ verdict: 'revisa' })).toBe('warn')
    expect(payGate({ verdict: 'no_firmes' })).toBe('block')
  })
  it('the pay button sends exactly the checked transfer, with the USDC fee adapter', () => {
    const tx = payTx(link('10e6'), 'sepolia')
    expect(tx.to).toBe(TOK)
    const d = decodeFunctionData({ abi: erc20Abi, data: tx.data! })
    expect(d.functionName).toBe('transfer')
    expect(d.args).toEqual([DEST, 10_000_000n])
    expect(tx.feeCurrency).toBeDefined()
    expect(tx.feeCurrency!.toLowerCase()).not.toBe(TOK.toLowerCase())
  })
})

describe('checkPayment client', () => {
  it('POSTs to /api/check and returns the verdict', async () => {
    let seen: { url: string; body: unknown } | undefined
    const f = (async (url: string, init: RequestInit) => { seen = { url, body: JSON.parse(String(init.body)) }; return new Response(JSON.stringify({ verdict: 'ok' }), { status: 200 }) }) as unknown as typeof fetch
    const r = await checkPayment('https://vigia.example/', { input: link('10e6'), expectedAmount: '10' }, { fetch: f })
    expect(r.verdict).toBe('ok')
    expect(seen!.url).toBe('https://vigia.example/api/check')
    expect(seen!.body).toMatchObject({ expectedAmount: '10' })
  })
  it('surfaces x402 payment requirements on 402', async () => {
    const f = (async () => new Response(JSON.stringify({ accepts: [{ network: 'celo-sepolia' }] }), { status: 402 })) as unknown as typeof fetch
    await expect(checkPayment('https://x', { input: DEST }, { fetch: f })).rejects.toBeInstanceOf(PaymentRequired)
  })
})
