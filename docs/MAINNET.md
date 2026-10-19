# Celo Mainnet (chain 42220): live run, 2026-10-19

**Public deployment: https://vigia-celo.netlify.app** (Netlify). `POST https://vigia-celo.netlify.app/api/check` (x402, 0.01 USDC) and `https://vigia-celo.netlify.app/pay?link=…`.

Everything below is on Celo Mainnet and can be checked on [Celoscan](https://celoscan.io) or [Blockscout](https://celo.blockscout.com).

- Operator wallet (deployer, owner of the agent, x402 `payTo`): [`0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2`](https://celoscan.io/address/0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2)
- x402 test payer (separate wallet, the facilitator rejects payer == payTo): [`0x62b3263a3d81B22EEe3911b6bE9E917523C37B0b`](https://celoscan.io/address/0x62b3263a3d81B22EEe3911b6bE9E917523C37B0b)
- The operator wallet holds **no CELO**. Gas is paid in **USDC** with Celo fee abstraction: `feeCurrency` = the USDC fee-currency adapter [`0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B`](https://celoscan.io/address/0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B) (token `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`), both taken from [docs.celo.org fee currencies](https://docs.celo.org/build/tools/contracts/fee-currencies).

## Operator txs (ERC-8021 tagged, gas in USDC)

Script: `MAINNET_SENDS_ENABLED=true CELO_DEPLOYER_PRIVATE_KEY=... npx tsx scripts/mainnet.ts <balances|transfer|register> [--dry]`. It estimates gas in USDC and keeps a 0.5 USDC reserve before each tx, refuses to broadcast any raw tx that is not CIP-64 with the USDC adapter and the attribution suffix, and records each step outside the repo so a tx is never re-sent blindly.

| Tx | Hash | Block | Gas used | Fee currency | Attribution |
|---|---|---|---|---|---|
| 1 USDC to the x402 payer | [`0xd51c6390…d20e`](https://celoscan.io/tx/0xd51c6390dd79c89b2c7e65b1d649293f61ec07f4620a06be7d132343b5a4d20e) ([Blockscout](https://celo.blockscout.com/tx/0xd51c6390dd79c89b2c7e65b1d649293f61ec07f4620a06be7d132343b5a4d20e)) | 80523142 | 177413 | USDC adapter | ✅ `celo_ee3c13be2ff7` |
| ERC-8004 `register(agentURI)` | [`0xcb786c47…7ce4`](https://celoscan.io/tx/0xcb786c47eff840ea971e1d2639d33b67852f9d5c9a482b163c3d2886a8b87ce4) ([Blockscout](https://celo.blockscout.com/tx/0xcb786c47eff840ea971e1d2639d33b67852f9d5c9a482b163c3d2886a8b87ce4)) | 80523161 | 329434 | USDC adapter | ✅ `celo_ee3c13be2ff7` |

Both txs together cost about 0.0084 USDC in gas. Each tx's on-chain `input` ends with `…63656c6f5f656533633133626532666637 11 00 80218021802180218021802180218021`: the ASCII code `celo_ee3c13be2ff7`, its length (0x11), schema 0x00 and the ERC-8021 marker. `fromDataSuffix(tx.input).codes` returns `["celo_ee3c13be2ff7"]`.

## ERC-8004 identity

- Identity Registry (Celo Mainnet, from [docs.celo.org/build/agents/8004](https://docs.celo.org/build/agents/8004)): [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://celoscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)
- **agentId: 9978**, owner `0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2`
- agentURI: `https://raw.githubusercontent.com/Simonethg/lofirmo/main/docs/agent-registration.json`
- Testnet identity: agentId 596 on Celo Sepolia (see `docs/TESTNET.md`).

## x402: live mainnet payments

Server config (local run, see Hosting below): `NEXT_PUBLIC_CELO_NETWORK=mainnet X402_ENABLED=true X402_FACILITATOR_URL=https://api.x402.celo.org X402_NETWORK=celo X402_PAY_TO=0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2 X402_API_KEY=<server secret>`. Price: 0.01 USDC per check (USDC mainnet, EIP-3009).

Buyer: `PAYER_KEY_FILE=<file outside the repo> npx tsx scripts/x402-pay.ts <base-url> '<payment link>' 10 --mode=pay|nopay|underpay`

Five paid checks of real example payment links (one good, four bad). Each settled 0.01 USDC from the payer to the operator wallet; the facilitator submits the transfer, so the payer needs no CELO.

| Link checked | Verdict | Findings | Settlement tx |
|---|---|---|---|
| `ethereum:0xcebA…118C@42220/transfer?address=0xA92f…eda2&uint256=10e6` (expected 10) | `ok` | FEE | [`0xf8cf8a42…6ebc`](https://celoscan.io/tx/0xf8cf8a420b842c9e670e96eab9eefcf582d6c9535a8c544aed9ff3ea4d8d6ebc) |
| same, `uint256=10e18` (18 decimals on a 6-decimal token) | `no_firmes` | CELO-001, AMOUNT_MISMATCH | [`0xfcb5644a…3ac2`](https://celoscan.io/tx/0xfcb5644a7edd3e17218abf193aaf90a11f4c53c6e1f6392f7eee7ae738f13ac2) |
| `ethereum:0x2F25…602B@42220/transfer?…&uint256=10e6` (adapter used as token) | `no_firmes` | CELO-003 | [`0x411756a6…7956`](https://celoscan.io/tx/0x411756a639f49e1e682266711cfe77a4b364480995a579c76edc2e2e883d7956) |
| same as good, `uint256=100e6` (expected 10) | `no_firmes` | AMOUNT_MISMATCH | [`0x8a8c7d2b…c564`](https://celoscan.io/tx/0x8a8c7d2ba7c55b5e35365cda18648513ca880ca353ae4bd17a526f51c740c564) |
| same as good, `@8453` (Base chain id) | `revisa` | WRONG_CHAIN | [`0x17685ebb…2119`](https://celoscan.io/tx/0x17685ebb6e1e7370ce7d3455fe26a5dfa37225b318ed81027151cccc3f632119) |

Blocks 80523247 to 80523301. Each settlement emits `Transfer(0x62b3…7B0b → 0xA92f…eda2, 10000)` on USDC. These txs are sent by the facilitator, not by the operator wallet, so they carry the facilitator's data, not Vigía's attribution tag.

Failure cases (nothing settles):

- **No payment**: `402` with `error: "X-PAYMENT header is required"` and `accepts[0] = { scheme: "exact", network: "celo", maxAmountRequired: "10000", asset: "0xcebA…118C", payTo: "0xA92f…eda2", extra: { name: "USDC", version: "2" } }`.
- **Bad payment** (authorization signed for 9999 instead of 10000): `402` with `error: "payment invalid: invalid_payment_amount"`, the reason returned by the facilitator's `/verify`.

## How to verify

1. Open each tx link above. The two operator txs show `from 0xA92f…eda2`, fee paid in USDC (fee currency `0x2F25…602B`), and input data ending in the ERC-8021 marker `80218021…8021`.
2. Decode the tag: `fromDataSuffix(tx.input)` from `@celo/attribution-tags` returns `codes: ["celo_ee3c13be2ff7"]`.
3. Identity: `ownerOf(9978)` on the Identity Registry returns `0xA92f…eda2`, and `tokenURI(9978)` returns the agentURI above.
4. x402: each settlement tx moves exactly 0.01 USDC from the payer to the operator wallet.

## Hosting

Vigía runs at **https://vigia-celo.netlify.app**: Netlify, Next.js through `@netlify/plugin-nextjs`, deployed with `node scripts/deploy-netlify.mjs`. The site env has `X402_ENABLED=true`, `X402_FACILITATOR_URL=https://api.x402.celo.org`, `X402_NETWORK=celo`, `X402_PAY_TO=0xA92f…eda2` and the facilitator API key (server-side only). `NEXT_PUBLIC_MINIPAY_MAINNET_PAY=true` enables the MiniPay Pay button, which signs from the person's own wallet with the USDC fee adapter and the ERC-8021 tag. `MAINNET_SENDS_ENABLED`, which gates sends from our own wallets, is unset, and no wallet private key is on the host.

- `/pay?link=…` runs the check on the server while the page renders, so people paying never hit the paywall. [Good link](https://vigia-celo.netlify.app/pay?link=ethereum%3A0xcebA9300f2b948710d2653dD7B07f33A8B32118C%4042220%2Ftransfer%3Faddress%3D0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2%26uint256%3D10e6&amount=10) shows "No problems found" and **Pay 10 USDC**. [Bad link (10e18)](https://vigia-celo.netlify.app/pay?link=ethereum%3A0xcebA9300f2b948710d2653dD7B07f33A8B32118C%4042220%2Ftransfer%3Faddress%3D0xA92fa55fA1a1E70334B6351Bc6457BEA6C8aeda2%26uint256%3D10e18&amount=10) shows "Don't sign it." with CELO-001 and AMOUNT_MISMATCH, and no pay button.
- `POST /api/check` with no payment returns **402** with the mainnet requirements (`network: celo`, `maxAmountRequired: 10000`, USDC `0xcebA…118C`, `payTo 0xA92f…eda2`).
- Paid check against the public URL (good link, verdict `ok`): settlement [`0x0b049664…dd8c`](https://celoscan.io/tx/0x0b049664bf6fbb7062b6b9775efa8a53d9d95931dc6c92df6cb8fad4711edd8c) ([Blockscout](https://celo.blockscout.com/tx/0x0b049664bf6fbb7062b6b9775efa8a53d9d95931dc6c92df6cb8fad4711edd8c)), block 80524771, `Transfer(0x62b3…7B0b → 0xA92f…eda2, 10000)`.

The first five settlements above ran against a local server before the public deploy existed.
