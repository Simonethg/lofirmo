import { describe, expect, it } from 'vitest'
import { encodeFunctionData, erc20Abi, maxUint256, type Address } from 'viem'
import { check, type ChainReader } from '@/lib/analyze'
import { parseInput } from '@/lib/parse'
import { TOKENS } from '@/lib/tokens'

const USDC = TOKENS.sepolia[0]
const USDm = TOKENS.sepolia[2]
const ALICE = '0x1111111111111111111111111111111111111111' as Address
const BOB = '0x2222222222222222222222222222222222222222' as Address

function reader(over: Partial<ChainReader> = {}): ChainReader {
  return {
    getTransactionCount: async () => 5,
    getCode: async () => undefined,
    balanceOf: async () => 10n ** 30n,
    call: async () => {},
    estimateGas: async () => 60_000n,
    gasPrice: async () => 25_000_000_000n,
    ...over,
  }
}
const ids = (r: { findings: { id: string }[] }) => r.findings.map((f) => f.id)

describe('parse', () => {
  it('plain address', () => {
    expect(parseInput(BOB).intent.kind).toBe('address')
  })
  it('EIP-681 transfer with sci notation', () => {
    const p = parseInput(`ethereum:${USDC.address}@11142220/transfer?address=${BOB}&uint256=1.5e6`)
    expect(p.intent).toMatchObject({ kind: 'transfer', amount: 1_500_000n })
    expect(p.chainId).toBe(11142220)
  })
  it('raw calldata approve', () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [BOB, 5n] })
    expect(parseInput(`${USDC.address}:${data}`).intent.kind).toBe('approve')
  })
  it('rejects garbage', () => {
    expect(() => parseInput('hola')).toThrow()
  })
})

describe('check', () => {
  const o = { network: 'sepolia' as const, reader: reader() }

  it('clean USDC transfer is green', async () => {
    const r = await check(`ethereum:${USDC.address}@11142220/transfer?address=${BOB}&uint256=10e6`, o)
    expect(r.semaforo).toBe('verde')
    expect(r.intent.monto).toBe('10 USDC')
    expect(r.fee?.currency).toBe('USDC')
  })
  it('CELO-001: USDC amount with 18 decimals', async () => {
    const r = await check(`ethereum:${USDC.address}@11142220/transfer?address=${BOB}&uint256=10e18`, o)
    expect(ids(r)).toContain('CELO-001')
    expect(r.verdict).toBe('no_firmes')
  })
  it('CELO-001: USDm amount with 6 decimals', async () => {
    const r = await check(`ethereum:${USDm.address}@11142220/transfer?address=${BOB}&uint256=10e6`, o)
    expect(ids(r)).toContain('CELO-001')
  })
  it('expected amount mismatch', async () => {
    const r = await check(`ethereum:${USDC.address}/transfer?address=${BOB}&uint256=100e6`, { ...o, expectedAmount: '10' })
    expect(ids(r)).toContain('AMOUNT_MISMATCH')
  })
  it('unlimited approve is red', async () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [BOB, maxUint256] })
    const r = await check({ to: USDC.address, data }, o)
    expect(ids(r)).toContain('UNLIMITED_APPROVE')
    expect(r.semaforo).toBe('rojo')
  })
  it('CELO-003: adapter used as token', async () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [BOB, 1_000_000n] })
    const r = await check({ to: USDC.adapter!, data }, o)
    expect(ids(r)).toContain('CELO-003')
  })
  it('CELO-002: feeCurrency is token not adapter', async () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [BOB, 1_000_000n] })
    const r = await check({ to: USDC.address, data, feeCurrency: USDC.address }, o)
    expect(ids(r)).toContain('CELO-002')
    const ok = await check({ to: USDC.address, data, feeCurrency: USDC.adapter }, o)
    expect(ids(ok)).not.toContain('CELO-002')
  })
  it('new recipient without history', async () => {
    const r = await check(BOB, { network: 'sepolia', reader: reader({ getTransactionCount: async () => 0 }) })
    expect(ids(r)).toContain('NEW_RECIPIENT')
    expect(r.semaforo).toBe('amarillo')
  })
  it('simulation revert + insufficient balance with from', async () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [BOB, 5_000_000n] })
    const r = await check({ to: USDC.address, data, from: ALICE }, {
      network: 'sepolia',
      reader: reader({ balanceOf: async () => 1n, call: async () => { throw new Error('execution reverted: ERC20: transfer amount exceeds balance') } }),
    })
    expect(ids(r)).toEqual(expect.arrayContaining(['INSUFFICIENT_BALANCE', 'SIMULATION_REVERT']))
  })
  it('fee shown in stablecoin, gas price asked with adapter', async () => {
    let asked: string | undefined
    const r = await check(`ethereum:${USDC.address}/transfer?address=${BOB}&uint256=1e6`, { network: 'sepolia', reader: reader({ gasPrice: async (fc) => { asked = fc; return 10n ** 9n } }) })
    expect(asked).toBe(USDC.adapter)
    expect(r.fee).toMatchObject({ currency: 'USDC' })
  })
  it('wrong chain in link', async () => {
    const r = await check(`ethereum:${USDC.address}@42220/transfer?address=${BOB}&uint256=1e6`, o)
    expect(ids(r)).toContain('WRONG_CHAIN')
  })
  it('send to token contract is red', async () => {
    const r = await check(`ethereum:${USDC.address}/transfer?address=${USDm.address}&uint256=1e6`, o)
    expect(ids(r)).toContain('SEND_TO_TOKEN')
  })
  it('RPC failure degrades to info', async () => {
    const r = await check(BOB, { network: 'sepolia', reader: reader({ getTransactionCount: async () => { throw new Error('down') } }) })
    expect(ids(r)).toContain('RPC_ERROR')
  })
})
