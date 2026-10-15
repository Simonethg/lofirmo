# Celo Sepolia (chain 11142220): real run

Server wallet: `lib/serverWallet.ts`. It reads `CELO_DEPLOYER_PRIVATE_KEY` from the environment only (with or without `0x`) and extends the viem wallet client with `withAttribution('celo_ee3c13be2ff7')` (ERC-8021), so every tx carries the tag. Mainnet stays blocked (`MAINNET_SENDS_ENABLED=false`).

Script: `CELO_DEPLOYER_PRIVATE_KEY=... npx tsx scripts/testnet.ts [--register]`

Wallet: [`0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2`](https://celo-sepolia.blockscout.com/address/0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2)

| Tx | Hash | Block | Attribution suffix |
|---|---|---|---|
| Self-transfer (0 CELO) | [`0x1293946c…2cf3`](https://celo-sepolia.blockscout.com/tx/0x1293946ce72c1c7279524c7a9cb998e719c12a1b4e811d1f1d8dbd97a02e2cf3) | 38785034 | ✅ `celo_ee3c13be2ff7` |
| ERC-8004 `register(agentURI)` | [`0x45d76527…319c`](https://celo-sepolia.blockscout.com/tx/0x45d76527d3f4c7cca06def4d1a8c0f698acaeff22a61bf751838b68dae03319c) | 38785039 | ✅ `celo_ee3c13be2ff7` |

Verification: we read each tx's on-chain `input` back, and `fromDataSuffix()` decodes the code `celo_ee3c13be2ff7`. The calldata ends with `…63656c6f5f656533633133626532666637 11 0080218021802180218021802180218021`: the ASCII code, its length, the schema byte 0x00, and the ERC-8021 marker `0x80218021802180218021802180218021`.

## ERC-8004 identity

- Identity Registry (Celo Sepolia): [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://celo-sepolia.blockscout.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e)
- **agentId: 596**, owner `0xA92f…eda2`
- agentURI: `https://raw.githubusercontent.com/Simonethg/lofirmo/main/docs/agent-registration.json`

## x402

`lib/x402.ts` now does the real flow against the Celo testnet facilitator `https://api.x402.sepolia.celo.org` (network `celo-sepolia`, testnet USDC `0x01C5C0122039549AD1493B8220cABEdD739BC44E`): it returns 402 plus requirements, then calls `/verify` and then `/settle` with `X-API-Key`, then serves the result with an `X-PAYMENT-RESPONSE` header. Unit tests cover it with a mocked facilitator.

No live payment has been made yet. It needs:
1. `X402_API_KEY`: a person creates it on https://x402.celo.org by connecting a wallet and signing.
2. A buyer wallet holding testnet USDC (for example from the Circle faucet), plus a buyer client (`@x402/fetch`) that signs the EIP-3009 authorization.

Then set `X402_ENABLED=true X402_PAY_TO=<address> X402_API_KEY=...`.
