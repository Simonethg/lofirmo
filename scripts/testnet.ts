/**
 * Real Celo Sepolia run: tagged self-transfer + ERC-8004 agent registration.
 * Usage: CELO_DEPLOYER_PRIVATE_KEY=... npx tsx scripts/testnet.ts [--register]
 * Prints only public data (address, tx hashes, agentId). Never prints the key.
 */
import { fromDataSuffix } from '@celo/attribution-tags'
import { parseAbi, parseEventLogs } from 'viem'
import { serverWallet } from '../lib/serverWallet'
import { ATTRIBUTION_TAG } from '../lib/config'

const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const
const AGENT_URI = 'https://raw.githubusercontent.com/Simonethg/lofirmo/main/docs/agent-registration.json'
const abi = parseAbi([
  'function register(string agentURI) returns (uint256 agentId)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
])

async function verify(pub: ReturnType<typeof serverWallet>['pub'], hash: `0x${string}`) {
  const r = await pub.waitForTransactionReceipt({ hash })
  const tx = await pub.getTransaction({ hash })
  const codes = fromDataSuffix(tx.input)?.codes ?? []
  console.log(JSON.stringify({ hash, status: r.status, block: r.blockNumber.toString(), suffixCodes: codes, tagged: codes.includes(ATTRIBUTION_TAG), inputTail: tx.input.slice(-80) }))
  return r
}

async function main() {
  const { account, wallet, pub } = serverWallet('sepolia')
  console.log('address', account.address, 'chain', await pub.getChainId())
  const h1 = await wallet.sendTransaction({ to: account.address, value: 0n })
  await verify(pub, h1)
  if (process.argv.includes('--register')) {
    const h2 = await wallet.writeContract({ address: IDENTITY_REGISTRY, abi, functionName: 'register', args: [AGENT_URI] })
    const r = await verify(pub, h2)
    const ev = parseEventLogs({ abi, logs: r.logs, eventName: 'Registered' })
    console.log('agentId', ev[0]?.args.agentId?.toString())
  }
}
main().catch((e) => { console.error('error:', (e as Error).message); process.exit(1) })
