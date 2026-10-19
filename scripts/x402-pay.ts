/**
 * x402 buyer for /api/check (x402 v1, scheme exact, EIP-3009 USDC). Works on Celo mainnet (`celo`) and Celo Sepolia.
 * Usage:
 *   PAYER_KEY_FILE=~/.lofirmo/payer.key npx tsx scripts/x402-pay.ts <base-url> '<payment link>' [expectedAmount] [--mode=pay|nopay|underpay]
 *   (PAYER_PRIVATE_KEY=... also works). The key is read from env or a file outside the repo and never printed.
 * Modes: pay = sign the exact amount (settles); nopay = no X-PAYMENT (expects 402 + requirements);
 *        underpay = sign 1 atomic unit less than required (expects 402 with the facilitator's reason, nothing settles).
 * The payer needs USDC only (no CELO): the facilitator submits the transfer.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { privateKeyToAccount } from 'viem/accounts'
import { normalizeKey } from '../lib/serverWallet'

const CHAIN_IDS: Record<string, number> = { celo: 42220, 'celo-sepolia': 11142220 }
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const mode = (process.argv.find((a) => a.startsWith('--mode=')) ?? '--mode=pay').slice(7)
const base = args[0] ?? 'http://localhost:3000'
const input = args[1] ?? '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'
const expectedAmount = args[2]
const url = `${base.replace(/\/$/, '')}/api/check`

function payerKey() {
  const file = process.env.PAYER_KEY_FILE?.replace(/^~/, process.env.HOME ?? '')
  return normalizeKey(process.env.PAYER_PRIVATE_KEY || (file ? readFileSync(file, 'utf8') : undefined))
}

async function call(xPayment?: string) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(xPayment ? { 'x-payment': xPayment } : {}) },
    body: JSON.stringify({ input, ...(expectedAmount ? { expectedAmount } : {}), network: 'mainnet' }),
  })
}

async function main() {
  const first = await call()
  const firstBody = (await first.json()) as { accepts: Record<string, any>[]; error?: string }
  if (first.status !== 402) throw new Error(`expected 402, got ${first.status}`)
  const req = firstBody.accepts[0]
  if (mode === 'nopay') {
    console.log(JSON.stringify({ mode, status: first.status, error: firstBody.error, accepts: firstBody.accepts }))
    return
  }
  const account = privateKeyToAccount(payerKey())
  const chainId = CHAIN_IDS[req.network]
  if (!chainId) throw new Error(`unknown x402 network ${req.network}`)
  const value = mode === 'underpay' ? (BigInt(req.maxAmountRequired) - 1n).toString() : req.maxAmountRequired
  const now = Math.floor(Date.now() / 1000)
  const authorization = {
    from: account.address,
    to: req.payTo,
    value,
    validAfter: String(now - 60),
    validBefore: String(now + req.maxTimeoutSeconds),
    nonce: `0x${randomBytes(32).toString('hex')}` as `0x${string}`,
  }
  const signature = await account.signTypedData({
    domain: { name: req.extra.name, version: req.extra.version, chainId, verifyingContract: req.asset },
    types: { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] },
    primaryType: 'TransferWithAuthorization',
    message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
  })
  const payment = { x402Version: 1, scheme: 'exact', network: req.network, payload: { signature, authorization } }
  const paid = await call(Buffer.from(JSON.stringify(payment)).toString('base64'))
  const pr = paid.headers.get('x-payment-response')
  const body = (await paid.json().catch(() => ({}))) as Record<string, any>
  console.log(JSON.stringify({
    mode, payer: account.address, payTo: req.payTo, network: req.network, value, status: paid.status,
    settlement: pr ? JSON.parse(Buffer.from(pr, 'base64').toString('utf8')) : null,
    verdict: body.verdict, resumen: body.resumen, findings: body.findings?.map((f: any) => f.id), error: body.error,
  }))
}
main().catch((e) => { console.error('error:', (e as Error).message); process.exit(1) })
