import { celo, celoSepolia } from 'viem/chains'
import type { Network } from './tokens'

/**
 * Hackathon attribution tag (Agents on Open Rails). Attached to EVERY tx via
 * withAttribution() in lib/wallet.ts. Public by design (it is on-chain).
 */
export const ATTRIBUTION_TAG = 'celo_ee3c13be2ff7'

export const CHAINS = { mainnet: celo, sepolia: celoSepolia } as const

export function currentNetwork(): Network {
  const n = process.env.NEXT_PUBLIC_CELO_NETWORK
  return n === 'mainnet' ? 'mainnet' : 'sepolia'
}

export function rpcUrl(net: Network): string | undefined {
  const v = net === 'mainnet' ? process.env.CELO_MAINNET_RPC_URL : process.env.CELO_SEPOLIA_RPC_URL
  return v || undefined
}

/** MVP safety switch: no tx is ever sent on mainnet from this app. */
export const MAINNET_SENDS_ENABLED = false

export const X402 = {
  enabled: () => process.env.X402_ENABLED === 'true',
  facilitatorUrl: () => process.env.X402_FACILITATOR_URL || 'https://x402.celo.org',
  network: () => process.env.X402_NETWORK || 'celo',
  priceUsd: () => process.env.X402_PRICE_USD || '0.01',
  payTo: () => process.env.X402_PAY_TO || '',
}
