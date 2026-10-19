/**
 * Celo MAINNET (42220) operator script: gas paid in USDC via the fee-currency adapter, ERC-8021 tag on every tx.
 * Usage: MAINNET_SENDS_ENABLED=true CELO_DEPLOYER_PRIVATE_KEY=... npx tsx scripts/mainnet.ts <balances|transfer|register>
 *   transfer  sends 1 USDC to the x402 payer (PAYER_ADDRESS)
 *   register  ERC-8004 register(agentURI) on the mainnet IdentityRegistry
 * Safety: a pre-send guard refuses any raw tx that lacks the attribution suffix or the USDC adapter; every
 * step is recorded in OPS_STATE (outside the repo) and is never re-sent once a hash exists. Prints public data only.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fromDataSuffix, toDataSuffix } from '@celo/attribution-tags'
import { createPublicClient, createWalletClient, custom, encodeFunctionData, erc20Abi, formatUnits, http, parseAbi, parseEventLogs, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo } from 'viem/chains'
import { withAttribution } from '@celo/attribution-tags'
import { ATTRIBUTION_TAG, MAINNET_SENDS_ENABLED, rpcUrl } from '../lib/config'
import { normalizeKey } from '../lib/serverWallet'

// docs.celo.org/build/tools/contracts/fee-currencies (Celo Mainnet, USDC row)
const USDC = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const USDC_ADAPTER = '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B' as const
// docs.celo.org/build/agents/8004 (Celo Mainnet Identity Registry)
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const
const AGENT_URI = 'https://raw.githubusercontent.com/Simonethg/lofirmo/main/docs/agent-registration.json'
const PAYER = (process.env.PAYER_ADDRESS ?? '0x62b3263a3d81B22EEe3911b6bE9E917523C37B0b') as Address
const RESERVE = 500_000n // 0.5 USDC kept for gas
const STATE = process.env.OPS_STATE ?? join(homedir(), '.lofirmo', 'mainnet-state.json')
const SUFFIX = toDataSuffix(ATTRIBUTION_TAG).slice(2).toLowerCase()
const regAbi = parseAbi([
  'function register(string agentURI) returns (uint256 agentId)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
])

const base = http(rpcUrl('mainnet'))
// Pre-send guard: never broadcast a tx without the tag suffix or without the USDC adapter as feeCurrency.
const guarded = custom({
  async request({ method, params }) {
    if (method === 'eth_sendRawTransaction') {
      const raw = String((params as unknown[])[0]).toLowerCase()
      if (!raw.startsWith('0x7b')) throw new Error('guard: not a CIP-64 (feeCurrency) tx')
      if (!raw.includes(SUFFIX)) throw new Error('guard: ERC-8021 attribution suffix missing')
      if (!raw.includes(USDC_ADAPTER.slice(2).toLowerCase())) throw new Error('guard: feeCurrency is not the USDC adapter')
      console.log('guard ok: CIP-64, feeCurrency=USDC adapter, suffix present')
    }
    return base({ chain: celo }).request({ method, params } as never)
  },
})

const state: Record<string, any> = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2))
const pub = createPublicClient({ chain: celo, transport: base })

async function balances(addrs: Address[]) {
  for (const a of addrs) {
    const u = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] })
    console.log(a, 'USDC', formatUnits(u, 6), 'CELO', formatUnits(await pub.getBalance({ address: a }), 18), 'nonce', await pub.getTransactionCount({ address: a }))
  }
}

async function verify(hash: Hex) {
  const r = await pub.waitForTransactionReceipt({ hash })
  const tx = await pub.getTransaction({ hash })
  const codes = fromDataSuffix(tx.input)?.codes ?? []
  const out = { hash, status: r.status, block: r.blockNumber.toString(), feeCurrency: (tx as any).feeCurrency, gasUsed: r.gasUsed.toString(), suffixCodes: codes, tagged: codes.includes(ATTRIBUTION_TAG), inputTail: tx.input.slice(-74) }
  console.log(JSON.stringify(out))
  if (!out.tagged) throw new Error('tx landed WITHOUT the attribution tag; stopping')
  return { r, out }
}

async function main() {
  const cmd = process.argv[2]
  const account = privateKeyToAccount(normalizeKey(process.env.CELO_DEPLOYER_PRIVATE_KEY))
  if (cmd === 'balances') return balances([account.address, PAYER])
  if (!MAINNET_SENDS_ENABLED) throw new Error('set MAINNET_SENDS_ENABLED=true to send on mainnet')
  if (cmd !== 'transfer' && cmd !== 'register') throw new Error('usage: balances|transfer|register')
  if (cmd === 'register' && !state.transfer?.tagged) throw new Error('first tx not verified as tagged yet')
  if (state[cmd]?.hash) {
    console.log(`${cmd} already sent: ${state[cmd].hash}; checking receipt instead of re-sending`)
    const { r, out } = await verify(state[cmd].hash)
    return report(cmd, r, out)
  }
  if (state[cmd]?.nonce !== undefined) {
    const latest = await pub.getTransactionCount({ address: account.address })
    if (latest > state[cmd].nonce) throw new Error(`${cmd}: nonce ${state[cmd].nonce} was used but no hash was recorded; check the explorer before retrying`)
  }
  const wallet = createWalletClient({ account, chain: celo, transport: guarded }).extend(withAttribution(ATTRIBUTION_TAG))
  const call = cmd === 'transfer'
    ? { to: USDC as Address, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [PAYER, 1_000_000n] }), spend: 1_000_000n }
    : { to: IDENTITY_REGISTRY as Address, data: encodeFunctionData({ abi: regAbi, functionName: 'register', args: [AGENT_URI] }), spend: 0n }
  const tagged = (call.data + SUFFIX) as Hex
  const gas = await pub.estimateGas({ account: account.address, to: call.to, data: tagged, feeCurrency: USDC_ADAPTER } as never)
  const price = BigInt(await pub.request({ method: 'eth_gasPrice', params: [USDC_ADAPTER] } as never) as string)
  const gasLimit = (gas * 13n) / 10n
  const maxFeeUsdc = (gasLimit * price * 2n) / 10n ** 12n // adapter quotes 18 decimals, USDC has 6
  const bal = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] })
  console.log(JSON.stringify({ cmd, estGas: gas.toString(), gasLimit: gasLimit.toString(), priceInAdapterUnits: price.toString(), maxFeeUsdc: formatUnits(maxFeeUsdc, 6), balanceUsdc: formatUnits(bal, 6) }))
  if (bal - call.spend - maxFeeUsdc < RESERVE) throw new Error('budget: would leave less than 0.5 USDC reserve')
  if (process.argv.includes('--dry')) return console.log('dry run: not sending')
  const nonce = await pub.getTransactionCount({ address: account.address, blockTag: 'pending' })
  state[cmd] = { nonce, startedAt: new Date().toISOString() }
  save()
  const hash = await wallet.sendTransaction({ to: call.to, data: call.data, feeCurrency: USDC_ADAPTER, gas: gasLimit, nonce } as never)
  state[cmd].hash = hash
  save()
  console.log('sent', hash)
  const { r, out } = await verify(hash)
  report(cmd, r, out)
}

function report(cmd: string, r: any, out: any) {
  state[cmd] = { ...state[cmd], ...out }
  if (cmd === 'register') {
    const ev = parseEventLogs({ abi: regAbi, logs: r.logs, eventName: 'Registered' })
    state.register.agentId = ev[0]?.args.agentId?.toString()
    console.log('agentId', state.register.agentId)
  }
  save()
}

main().catch((e) => { console.error('error:', (e as Error).message); process.exit(1) })
