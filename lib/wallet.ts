'use client'
import { withAttribution } from '@celo/attribution-tags'
import { createWalletClient, custom, type EIP1193Provider } from 'viem'
import { ATTRIBUTION_TAG, CHAINS, MINIPAY_MAINNET_PAY } from './config'
import type { Network } from './tokens'

declare global {
  interface Window {
    ethereum?: EIP1193Provider & { isMiniPay?: boolean }
  }
}

export const isMiniPay = () => typeof window !== 'undefined' && !!window.ethereum?.isMiniPay

/**
 * The ONLY way this app builds a wallet client: every sendTransaction /
 * writeContract carries the ERC-8021 attribution tag.
 */
export function walletClient(net: Network) {
  if (!window.ethereum) throw new Error('No wallet found (open the app inside MiniPay)')
  // User-wallet sends only (MiniPay). Operator sends from our wallets are gated by MAINNET_SENDS_ENABLED in serverWallet.
  if (net === 'mainnet' && !MINIPAY_MAINNET_PAY) throw new Error('Paying on mainnet is not enabled on this deployment')
  return createWalletClient({ chain: CHAINS[net], transport: custom(window.ethereum) }).extend(withAttribution(ATTRIBUTION_TAG))
}

/** MiniPay connects implicitly; eth_requestAccounts returns the address without a prompt. */
export async function connectedAddress(): Promise<string | undefined> {
  if (!window.ethereum) return undefined
  const accts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
  return accts[0]
}

/** MiniPay custom QR scanner. Returns the scanned text or undefined if unsupported. */
export async function scanQr(): Promise<string | undefined> {
  if (!window.ethereum) return undefined
  try {
    const r = await (window.ethereum.request as (a: { method: string; params?: unknown[] }) => Promise<unknown>)({ method: 'scanQrCode', params: [] })
    return typeof r === 'string' ? r : undefined
  } catch {
    return undefined
  }
}
