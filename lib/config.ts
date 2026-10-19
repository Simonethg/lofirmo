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

/**
 * Safety switch: mainnet sends are off unless the server env sets MAINNET_SENDS_ENABLED=true
 * (only the operator scripts do this). Browser bundles never see it, so it stays false there.
 */
export const MAINNET_SENDS_ENABLED = typeof process !== 'undefined' && process.env.MAINNET_SENDS_ENABLED === 'true'

/**
 * User-wallet Pay button on mainnet (MiniPay signs from the person's own wallet; the host has no keys).
 * Separate from MAINNET_SENDS_ENABLED, which only gates operator sends from our own wallets.
 * NEXT_PUBLIC_ so Next inlines it into the browser bundle at build time.
 */
export const MINIPAY_MAINNET_PAY = process.env.NEXT_PUBLIC_MINIPAY_MAINNET_PAY === 'true'

export const X402 = {
  enabled: () => process.env.X402_ENABLED === 'true',
  /** Testnet facilitator by default; mainnet is https://api.x402.celo.org with X402_NETWORK=celo */
  facilitatorUrl: () => process.env.X402_FACILITATOR_URL || 'https://api.x402.sepolia.celo.org',
  network: () => process.env.X402_NETWORK || 'celo-sepolia',
  /** Server-only facilitator key (created by the human on x402.celo.org). Never sent to clients. */
  apiKey: () => process.env.X402_API_KEY || '',
  priceUsd: () => process.env.X402_PRICE_USD || '0.01',
  payTo: () => process.env.X402_PAY_TO || '',
}
