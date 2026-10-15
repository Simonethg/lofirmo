import type { Address } from 'viem'

export type Network = 'mainnet' | 'sepolia'

export interface TokenInfo {
  symbol: string
  address: Address
  decimals: number
  /** fee-currency adapter address (only for non-18-decimal tokens) */
  adapter?: Address
}

// Source: https://docs.celo.org/build/tools/contracts/fee-currencies
// Ported from Simonethg/arcguard detectors/celo/rules.py (TOKEN_TO_ADAPTER).
export const TOKENS: Record<Network, TokenInfo[]> = {
  mainnet: [
    { symbol: 'USDC', address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', decimals: 6, adapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B' },
    { symbol: 'USDT', address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e', decimals: 6, adapter: '0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72' },
    { symbol: 'USAT', address: '0xD2ab3C9A02dbbAB236bfEC45D1D755Df4267F771', decimals: 6, adapter: '0x0357EE22278c922e1D36cFe6b899269b161880C4' },
    { symbol: 'USDm', address: '0x765DE816845861e75A25fCA122bb6898B8B1282a', decimals: 18 },
    { symbol: 'CELO', address: '0x471EcE3750Da237f93B8E339c536989b8978a438', decimals: 18 },
  ],
  sepolia: [
    { symbol: 'USDC', address: '0x01C5C0122039549AD1493B8220cABEdD739BC44E', decimals: 6, adapter: '0xbf1441Ea57f43f35f713431001f35742c88071c7' },
    { symbol: 'USDT', address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', decimals: 6, adapter: '0xe19447B12cb0d0220B2a501D8382be2f61CcF92a' },
    { symbol: 'USDm', address: '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b', decimals: 18 },
  ],
}

const lc = (a: string) => a.toLowerCase()

export function findToken(net: Network, addr?: string | null): TokenInfo | undefined {
  if (!addr) return undefined
  return TOKENS[net].find((t) => lc(t.address) === lc(addr))
}

export function findAdapter(net: Network, addr?: string | null): TokenInfo | undefined {
  if (!addr) return undefined
  return TOKENS[net].find((t) => t.adapter && lc(t.adapter) === lc(addr))
}

/** The address MiniPay/Celo expects in `feeCurrency` for a given token. */
export function feeCurrencyFor(t: TokenInfo): Address {
  return t.adapter ?? t.address
}
