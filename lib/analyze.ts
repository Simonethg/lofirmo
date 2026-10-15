import { createPublicClient, encodeFunctionData, erc20Abi, formatUnits, http, maxUint256, type Address, type Hex } from 'viem'
import { CHAINS, rpcUrl } from './config'
import { parseInput, type Parsed, type RawTx } from './parse'
import { feeCurrencyFor, findAdapter, findToken, type Network, type TokenInfo } from './tokens'

export type Severity = 'critica' | 'alta' | 'media' | 'info'
export type Verdict = 'no_firmes' | 'revisa' | 'ok'

export interface Finding {
  id: string
  severity: Severity
  titulo: string
  detalle: string
}

export interface CheckResult {
  network: Network
  chainId: number
  verdict: Verdict
  semaforo: 'rojo' | 'amarillo' | 'verde'
  resumen: string
  intent: Record<string, string | undefined>
  findings: Finding[]
  fee?: { amount: string; currency: string; gas: string }
  simulated: boolean
}

/** Minimal chain surface so the analyzer is testable without RPC. */
export interface ChainReader {
  getTransactionCount(a: Address): Promise<number>
  getCode(a: Address): Promise<Hex | undefined>
  balanceOf(token: Address, owner: Address): Promise<bigint>
  call(tx: { from: Address; to: Address; data?: Hex; value?: bigint }): Promise<void>
  estimateGas(tx: { from: Address; to: Address; data?: Hex; value?: bigint; feeCurrency?: Address }): Promise<bigint>
  gasPrice(feeCurrency?: Address): Promise<bigint>
}

export function viemReader(net: Network): ChainReader {
  const client = createPublicClient({ chain: CHAINS[net], transport: http(rpcUrl(net)) })
  return {
    getTransactionCount: (address) => client.getTransactionCount({ address }),
    getCode: (address) => client.getCode({ address }),
    balanceOf: (token, owner) => client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
    call: async (tx) => {
      await client.call({ account: tx.from, to: tx.to, data: tx.data, value: tx.value })
    },
    estimateGas: (tx) =>
      client.estimateGas({ account: tx.from, to: tx.to, data: tx.data, value: tx.value, ...(tx.feeCurrency ? { feeCurrency: tx.feeCurrency } : {}) } as never),
    gasPrice: async (feeCurrency) => {
      // Celo nodes accept a feeCurrency param on eth_gasPrice and return the price in that currency.
      const p = await client.request({ method: 'eth_gasPrice', params: feeCurrency ? ([feeCurrency] as never) : ([] as never) } as never)
      return BigInt(p as string)
    },
  }
}

const TEN12 = 10n ** 12n
const fmt = (amount: bigint, t?: TokenInfo) => (t ? `${formatUnits(amount, t.decimals)} ${t.symbol}` : `${amount} (unidades crudas, token desconocido)`)
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export interface CheckOptions {
  network: Network
  /** amount the user expects to pay, human units (e.g. "10.5") */
  expectedAmount?: string
  reader?: ChainReader
}

export async function check(input: string | RawTx, opts: CheckOptions): Promise<CheckResult> {
  const net = opts.network
  const parsed: Parsed = parseInput(input)
  const { intent, tx } = parsed
  const findings: Finding[] = []
  const add = (f: Finding) => findings.push(f)
  const chainId = CHAINS[net].id

  if (parsed.chainId && parsed.chainId !== chainId) {
    add({ id: 'WRONG_CHAIN', severity: 'alta', titulo: 'Wrong network', detalle: `The link is for chain ${parsed.chainId}, but you are on ${CHAINS[net].name} (${chainId}).` })
  }

  const tokenAddr = intent.kind === 'transfer' || intent.kind === 'approve' || intent.kind === 'transferFrom' ? intent.token : undefined
  const token = findToken(net, tokenAddr)
  const amount = 'amount' in intent ? intent.amount : undefined
  const recipient = intent.kind === 'transfer' || intent.kind === 'transferFrom' ? intent.to : intent.kind === 'native' || intent.kind === 'address' ? intent.to : undefined

  // CELO-003: adapter used as token
  const asAdapter = findAdapter(net, tokenAddr ?? tx.to)
  if (asAdapter) {
    add({ id: 'CELO-003', severity: 'critica', titulo: 'Fee adapter address used as token', detalle: `${short(tokenAddr ?? tx.to)} is the ${asAdapter.symbol} fee adapter, not the token. To move ${asAdapter.symbol}, use ${asAdapter.address}. The adapter only belongs in feeCurrency.` })
  } else if (tokenAddr && !token) {
    add({ id: 'UNKNOWN_TOKEN', severity: 'media', titulo: 'Unknown token', detalle: `${short(tokenAddr)} is not USDC, USDT, USA₮ or USDm on ${CHAINS[net].name}. Make sure it is the token you think it is.` })
  }

  // CELO-001: decimals
  if (token && amount !== undefined && amount > 0n && intent.kind !== 'approve') {
    if (token.decimals === 6 && amount >= TEN12 && amount % TEN12 === 0n) {
      add({ id: 'CELO-001', severity: 'critica', titulo: 'Wrong decimals (18 instead of 6)', detalle: `${token.symbol} on Celo has 6 decimals. The encoded amount is ${fmt(amount, token)}, ${'\u2248'}10¹² times what you probably meant (${formatUnits(amount / TEN12, 6)} ${token.symbol}).` })
    } else if (token.decimals === 18 && amount < TEN12) {
      add({ id: 'CELO-001', severity: 'alta', titulo: 'Wrong decimals (6 instead of 18)', detalle: `${token.symbol} has 18 decimals. The amount is ${fmt(amount, token)}, almost nothing: it looks computed with 6 decimals.` })
    }
  }
  if (token && amount !== undefined && opts.expectedAmount) {
    const shown = Number(formatUnits(amount, token.decimals))
    const exp = Number(opts.expectedAmount)
    if (exp > 0 && Math.abs(shown - exp) / exp > 0.01) {
      add({ id: 'AMOUNT_MISMATCH', severity: 'critica', titulo: "Amount doesn't match", detalle: `You expected ${opts.expectedAmount} ${token.symbol}, but the transaction moves ${fmt(amount, token)}.` })
    }
  }

  // Unlimited approve
  if (intent.kind === 'approve') {
    if (intent.amount === maxUint256 || intent.amount >= 2n ** 128n) {
      add({ id: 'UNLIMITED_APPROVE', severity: 'critica', titulo: 'Unlimited approval', detalle: `You give ${short(intent.spender)} permission to spend ALL your ${token?.symbol ?? 'token'}, forever. Approve only the exact amount.` })
    } else {
      add({ id: 'APPROVE', severity: 'media', titulo: 'You are granting a spending approval', detalle: `${short(intent.spender)} will be able to spend up to ${fmt(intent.amount, token)} of your balance without asking you to sign again.` })
    }
  }

  // CELO-002: feeCurrency token vs adapter
  if (tx.feeCurrency) {
    const fcTok = findToken(net, tx.feeCurrency)
    if (fcTok && fcTok.adapter) {
      add({ id: 'CELO-002', severity: 'alta', titulo: 'feeCurrency points to the token, not the adapter', detalle: `To pay the network fee in ${fcTok.symbol}, use the adapter ${fcTok.adapter}, not the token ${short(fcTok.address)}. As is, the tx fails or the wallet replaces it.` })
    } else if (!fcTok && !findAdapter(net, tx.feeCurrency)) {
      add({ id: 'UNKNOWN_FEE_CURRENCY', severity: 'media', titulo: 'Unknown fee currency', detalle: `${short(tx.feeCurrency)} is not in the list of known fee currencies.` })
    }
  }

  // Recipient = token contract
  if (recipient && (findToken(net, recipient) || findAdapter(net, recipient))) {
    add({ id: 'SEND_TO_TOKEN', severity: 'critica', titulo: 'Recipient is a token contract', detalle: 'Sending funds to the token contract itself loses them forever.' })
  }

  // On-chain checks
  const reader = opts.reader ?? viemReader(net)
  let simulated = false
  let fee: CheckResult['fee']
  const watch = intent.kind === 'approve' ? intent.spender : recipient
  if (watch) {
    try {
      const [n, code] = await Promise.all([reader.getTransactionCount(watch), reader.getCode(watch)])
      const isContract = !!code && code !== '0x'
      if (!isContract && n === 0) {
        add({ id: 'NEW_RECIPIENT', severity: 'media', titulo: 'Recipient has no history', detalle: `${short(watch)} has never sent a transaction on ${CHAINS[net].name}. If you don't know it, confirm it another way before paying.` })
      } else if (isContract && intent.kind !== 'approve') {
        add({ id: 'RECIPIENT_CONTRACT', severity: 'info', titulo: 'Recipient is a contract', detalle: `${short(watch)} is a contract, not a person. Make sure it is the right service.` })
      }
    } catch (e) {
      add({ id: 'RPC_ERROR', severity: 'info', titulo: "Couldn't reach the network", detalle: `No on-chain data for the recipient: ${(e as Error).message.slice(0, 120)}` })
    }
  }

  const from = tx.from
  const callTo = tx.to ?? (tokenAddr as Address | undefined)
  const callData: Hex | undefined =
    tx.data ??
    (intent.kind === 'transfer'
      ? encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [intent.to, intent.amount] })
      : intent.kind === 'approve'
        ? encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [intent.spender, intent.amount] })
        : undefined)
  const value = tx.value ?? (intent.kind === 'native' ? intent.value : undefined)
  // fee currency the user will pay with: explicit, else the token being moved
  const feeTok = tx.feeCurrency ? (findToken(net, tx.feeCurrency) ?? findAdapter(net, tx.feeCurrency)) : token
  const feeCurrency = feeTok ? feeCurrencyFor(feeTok) : undefined

  if (from && callTo) {
    try {
      if (intent.kind === 'transfer' && token) {
        const bal = await reader.balanceOf(token.address, from)
        if (bal < intent.amount) add({ id: 'INSUFFICIENT_BALANCE', severity: 'alta', titulo: 'Insufficient balance', detalle: `You have ${fmt(bal, token)} and the tx needs ${fmt(intent.amount, token)}.` })
      }
      await reader.call({ from, to: callTo, data: callData, value })
      simulated = true
    } catch (e) {
      add({ id: 'SIMULATION_REVERT', severity: 'alta', titulo: 'The transaction would fail', detalle: `Simulation reverts: ${(e as Error).message.split('\n')[0].slice(0, 160)}` })
    }
  }
  try {
    const gas = from && callTo ? await reader.estimateGas({ from, to: callTo, data: callData, value, feeCurrency }) : callData ? 65_000n : 21_000n
    const price = await reader.gasPrice(feeCurrency)
    // gas price with an adapter / USDm feeCurrency is quoted with 18 decimals
    const sym = feeTok?.symbol ?? 'CELO'
    const amt = Number(formatUnits(gas * price, 18))
    fee = { amount: amt < 0.0001 ? '<0.0001' : amt.toFixed(4), currency: sym, gas: gas.toString() }
    add({ id: 'FEE', severity: 'info', titulo: 'Estimated network fee', detalle: `~${fee.amount} ${sym}${from ? '' : ' (estimate without sender)'}. MiniPay can charge it in the stablecoin you hold most of.` })
  } catch {
    /* fee is best-effort */
  }

  const worst = findings.some((f) => f.severity === 'critica') ? 'no_firmes' : findings.some((f) => f.severity === 'alta' || f.severity === 'media') ? 'revisa' : 'ok'
  const semaforo = worst === 'no_firmes' ? 'rojo' : worst === 'revisa' ? 'amarillo' : 'verde'
  const resumen = worst === 'no_firmes' ? "Don't sign it." : worst === 'revisa' ? 'Review it before signing.' : 'No problems found. You can sign.'

  const out: Record<string, string | undefined> = { tipo: intent.kind, token: token?.symbol ?? tokenAddr }
  if (amount !== undefined) out.monto = fmt(amount, token)
  if (recipient) out.destinatario = recipient
  if (intent.kind === 'approve') out.spender = intent.spender
  if (intent.kind === 'native') out.monto = `${formatUnits(intent.value, 18)} CELO`

  return { network: net, chainId, verdict: worst, semaforo, resumen, intent: out, findings, fee, simulated }
}
