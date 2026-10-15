import { withAttribution } from '@celo/attribution-tags'
import { createPublicClient, createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ATTRIBUTION_TAG, CHAINS, MAINNET_SENDS_ENABLED, rpcUrl } from './config'
import type { Network } from './tokens'

/** Normalizes a hex private key from env (accepts with or without 0x). Never logs it. */
export function normalizeKey(raw: string | undefined): Hex {
  const k = (raw ?? '').trim()
  if (!k) throw new Error('CELO_DEPLOYER_PRIVATE_KEY is not set')
  const h = (k.startsWith('0x') ? k : `0x${k}`) as Hex
  if (!/^0x[0-9a-fA-F]{64}$/.test(h)) throw new Error('CELO_DEPLOYER_PRIVATE_KEY is malformed')
  return h
}

/**
 * Server-side wallet. The key is read from env ONLY, never from files or requests.
 * Every tx carries the ERC-8021 attribution tag. Mainnet is blocked by MAINNET_SENDS_ENABLED.
 */
export function serverWallet(net: Network = 'sepolia') {
  if (net === 'mainnet' && !MAINNET_SENDS_ENABLED) throw new Error('Envíos en mainnet deshabilitados en este MVP')
  const account = privateKeyToAccount(normalizeKey(process.env.CELO_DEPLOYER_PRIVATE_KEY))
  const transport = http(rpcUrl(net))
  const wallet = createWalletClient({ account, chain: CHAINS[net], transport }).extend(withAttribution(ATTRIBUTION_TAG))
  const pub = createPublicClient({ chain: CHAINS[net], transport })
  return { account, wallet, pub }
}
