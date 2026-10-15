/**
 * x402 buyer for /api/check (x402 v1, scheme exact, EIP-3009 USDC on Celo Sepolia).
 * Usage: PAYER_PRIVATE_KEY=... npx tsx scripts/x402-pay.ts [url]
 * The payer key comes from env only; keep it outside the repo. Payer needs testnet USDC, no CELO.
 */
import { randomBytes } from 'node:crypto'
import { privateKeyToAccount } from 'viem/accounts'
import { normalizeKey } from '../lib/serverWallet'

const url = process.argv[2] ?? 'http://localhost:3000/api/check?input=0x8004A818BFB912233c491871b3d84c89A494BD9e&network=sepolia'

async function main() {
  const account = privateKeyToAccount(normalizeKey(process.env.PAYER_PRIVATE_KEY))
  const first = await fetch(url)
  if (first.status !== 402) throw new Error(`expected 402, got ${first.status}`)
  const req = ((await first.json()) as { accepts: Record<string, any>[] }).accepts[0]
  const now = Math.floor(Date.now() / 1000)
  const authorization = {
    from: account.address,
    to: req.payTo,
    value: req.maxAmountRequired,
    validAfter: String(now - 60),
    validBefore: String(now + req.maxTimeoutSeconds),
    nonce: `0x${randomBytes(32).toString('hex')}` as `0x${string}`,
  }
  const signature = await account.signTypedData({
    domain: { name: req.extra.name, version: req.extra.version, chainId: 11142220, verifyingContract: req.asset },
    types: { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] },
    primaryType: 'TransferWithAuthorization',
    message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
  })
  const payment = { x402Version: 1, scheme: 'exact', network: req.network, payload: { signature, authorization } }
  const paid = await fetch(url, { headers: { 'x-payment': Buffer.from(JSON.stringify(payment)).toString('base64') } })
  const pr = paid.headers.get('x-payment-response')
  console.log('payer', account.address, 'status', paid.status)
  console.log('settlement', pr ? Buffer.from(pr, 'base64').toString('utf8') : null)
  console.log('body', (await paid.text()).slice(0, 300))
}
main().catch((e) => { console.error('error:', (e as Error).message); process.exit(1) })
