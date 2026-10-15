import { decodeFunctionData, erc20Abi, isAddress, getAddress, type Address, type Hex } from 'viem'

export interface RawTx {
  to?: string
  data?: string
  value?: string
  from?: string
  feeCurrency?: string
}

export type Intent =
  | { kind: 'address'; to: Address }
  | { kind: 'native'; to: Address; value: bigint }
  | { kind: 'transfer'; token: Address; to: Address; amount: bigint }
  | { kind: 'transferFrom'; token: Address; from: Address; to: Address; amount: bigint }
  | { kind: 'approve'; token: Address; spender: Address; amount: bigint }
  | { kind: 'unknown'; to?: Address; data?: Hex }

export interface Parsed {
  intent: Intent
  tx: { to?: Address; data?: Hex; value?: bigint; from?: Address; feeCurrency?: Address }
  /** chain id found in a payment link, if any */
  chainId?: number
  source: 'address' | 'eip681' | 'tx' | 'calldata'
}

function num(s: string): bigint {
  // EIP-681 allows scientific notation, e.g. 1.5e6
  const m = /^(\d+)(?:\.(\d+))?(?:e(\d+))?$/i.exec(s.trim())
  if (!m) throw new Error(`invalid number: ${s}`)
  const [, int, frac = '', exp = '0'] = m
  const e = Number(exp)
  if (frac.length > e) throw new Error(`not a whole number: ${s}`)
  return BigInt(int + frac + '0'.repeat(e - frac.length))
}

/** ethereum:/celo: payment links (EIP-681). */
export function parsePaymentLink(link: string): Parsed {
  const m = /^(?:ethereum|celo):(?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(?:\/(\w+))?(?:\?(.*))?$/.exec(link.trim())
  if (!m) throw new Error('link de pago no reconocido')
  const [, target, chain, fn, query = ''] = m
  const q = new URLSearchParams(query)
  const chainId = chain ? Number(chain) : undefined
  const t = getAddress(target)
  const feeCurrency = q.get('feeCurrency') ?? undefined
  const fc = feeCurrency && isAddress(feeCurrency) ? getAddress(feeCurrency) : undefined
  if (fn === 'transfer') {
    const to = q.get('address')
    const amt = q.get('uint256')
    if (!to || !isAddress(to) || !amt) throw new Error('link transfer incompleto (address / uint256)')
    return { source: 'eip681', chainId, tx: { to: t, feeCurrency: fc }, intent: { kind: 'transfer', token: t, to: getAddress(to), amount: num(amt) } }
  }
  if (fn === 'approve') {
    const sp = q.get('address')
    const amt = q.get('uint256')
    if (!sp || !isAddress(sp) || !amt) throw new Error('link approve incompleto (address / uint256)')
    return { source: 'eip681', chainId, tx: { to: t, feeCurrency: fc }, intent: { kind: 'approve', token: t, spender: getAddress(sp), amount: num(amt) } }
  }
  if (fn) return { source: 'eip681', chainId, tx: { to: t, feeCurrency: fc }, intent: { kind: 'unknown', to: t } }
  const value = q.get('value')
  if (value) return { source: 'eip681', chainId, tx: { to: t, value: num(value), feeCurrency: fc }, intent: { kind: 'native', to: t, value: num(value) } }
  return { source: 'eip681', chainId, tx: { to: t, feeCurrency: fc }, intent: { kind: 'address', to: t } }
}

export function decodeTx(raw: RawTx): Parsed {
  const to = raw.to && isAddress(raw.to) ? getAddress(raw.to) : undefined
  const from = raw.from && isAddress(raw.from) ? getAddress(raw.from) : undefined
  const feeCurrency = raw.feeCurrency && isAddress(raw.feeCurrency) ? getAddress(raw.feeCurrency) : undefined
  const data = raw.data && /^0x[0-9a-fA-F]*$/.test(raw.data) && raw.data !== '0x' ? (raw.data as Hex) : undefined
  const value = raw.value ? BigInt(raw.value) : undefined
  const tx = { to, data, value, from, feeCurrency }
  if (!data) {
    if (!to) throw new Error('falta destinatario (to)')
    return { source: 'tx', tx, intent: value ? { kind: 'native', to, value } : { kind: 'address', to } }
  }
  try {
    const d = decodeFunctionData({ abi: erc20Abi, data })
    if (to && d.functionName === 'transfer') {
      const [r, a] = d.args as [Address, bigint]
      return { source: 'tx', tx, intent: { kind: 'transfer', token: to, to: r, amount: a } }
    }
    if (to && d.functionName === 'approve') {
      const [s, a] = d.args as [Address, bigint]
      return { source: 'tx', tx, intent: { kind: 'approve', token: to, spender: s, amount: a } }
    }
    if (to && d.functionName === 'transferFrom') {
      const [f, r, a] = d.args as [Address, Address, bigint]
      return { source: 'tx', tx, intent: { kind: 'transferFrom', token: to, from: f, to: r, amount: a } }
    }
  } catch {
    /* not ERC-20 */
  }
  return { source: 'tx', tx, intent: { kind: 'unknown', to, data } }
}

/** Accepts: plain address, EIP-681 link, JSON tx, or "to:calldata". */
export function parseInput(input: string | RawTx): Parsed {
  if (typeof input !== 'string') return decodeTx(input)
  const s = input.trim()
  if (isAddress(s)) return { source: 'address', tx: { to: getAddress(s) }, intent: { kind: 'address', to: getAddress(s) } }
  if (/^(ethereum|celo):/i.test(s)) return parsePaymentLink(s)
  if (s.startsWith('{')) return decodeTx(JSON.parse(s) as RawTx)
  const m = /^(0x[0-9a-fA-F]{40})[:\s]+(0x[0-9a-fA-F]+)$/.exec(s)
  if (m) return { ...decodeTx({ to: m[1], data: m[2] }), source: 'calldata' }
  throw new Error("Couldn't read the input. Paste a 0x… address, an ethereum:/celo: link or a transaction JSON.")
}
