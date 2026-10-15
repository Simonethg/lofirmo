import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem'
import type { CheckResult } from './analyze'
import { parsePaymentLink } from './parse'
import { feeCurrencyFor, findToken, type Network } from './tokens'

/** What the /pay deep link carries: `/pay?link=<ethereum: or celo: URI>&amount=<expected, optional>`. */
export interface PayParams { link: string; expectedAmount?: string }

export function readPayParams(q: URLSearchParams): PayParams {
  const link = (q.get('link') ?? q.get('uri') ?? '').trim()
  if (!link) throw new Error('This page opens from a payment link: /pay?link=ethereum:…')
  const amount = (q.get('amount') ?? q.get('expectedAmount') ?? '').trim()
  return { link, expectedAmount: amount || undefined }
}

/** The person only sees a warning when something is wrong. */
export type PayGate = 'pay' | 'warn' | 'block'
export function payGate(r: Pick<CheckResult, 'verdict'>): PayGate {
  return r.verdict === 'ok' ? 'pay' : r.verdict === 'revisa' ? 'warn' : 'block'
}

/** The exact tx the Pay button sends for a payment link (no other tx is possible from this screen). */
export function payTx(link: string, net: Network): { to: Address; data?: Hex; value?: bigint; feeCurrency?: Address } {
  const p = parsePaymentLink(link)
  const i = p.intent
  if (i.kind === 'transfer') {
    const t = findToken(net, i.token)
    return { to: i.token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [i.to, i.amount] }), feeCurrency: t ? feeCurrencyFor(t) : undefined }
  }
  if (i.kind === 'native') return { to: i.to, value: i.value }
  throw new Error('Only token transfers and CELO payments can be paid from a link')
}
