# Vigía (Celo)

MiniPay (Celo) mini app that checks a payment **before you sign it**. Paste an address or a payment link (or scan a QR inside MiniPay) and get a verdict (`ok`, `review`, `don't sign`) with a plain-English explanation.

Vigía is one security product with one brand across Arc, Base and Celo. This repo is the Celo version (formerly "¿Lo firmo?"). The repo keeps the name `lofirmo` because the ERC-8004 agent registration points to it.

Built for the *Agents on Open Rails* hackathon (Celo). Current network: **Celo Sepolia (testnet)**. Mainnet is configured but **sends are disabled** (`MAINNET_SENDS_ENABLED = false`).

## What it checks

| ID | Check |
|---|---|
| CELO-001 | Wrong decimals (6 vs 18) |
| AMOUNT_MISMATCH | Amount differs from the expected one |
| UNLIMITED_APPROVE | Unlimited approve |
| CELO-002 | feeCurrency set to token instead of adapter |
| CELO-003 | Adapter address used as the token |
| NEW_RECIPIENT | Recipient with no on-chain history |
| SEND_TO_TOKEN | Sending to a token contract |
| WRONG_CHAIN | Link for another chain |
| SIMULATION_REVERT / INSUFFICIENT_BALANCE | viem simulation when `from` is known |
| FEE | Network fee quoted in the stablecoin |

Token/adapter addresses and the CELO-00x rules come from [docs.celo.org fee currencies](https://docs.celo.org/build/tools/contracts/fee-currencies) and are ported to TypeScript from the Celo detectors in [arcguard](https://github.com/Simonethg/arcguard) (PR #3).

## Usage

```bash
npm install
npm run dev        # http://localhost:3000
npm test
```

To test in MiniPay, enable *Developer mode* and load your URL (for example through an ngrok tunnel). The app detects `window.ethereum.isMiniPay`, reads the address without asking for a signature, and uses `scanQrCode` for QR codes.

### Accepted input
- Address: `0x…`
- EIP-681 link: `ethereum:<token>@11142220/transfer?address=<dest>&uint256=10e6`
- Tx JSON: `{"to":"0x…","data":"0x…","from":"0x…","feeCurrency":"0x…"}`
- `<to>:<calldata>`

## API

`POST /api/check` (or `GET /api/check?input=…`)

```bash
curl -X POST localhost:3000/api/check -H 'content-type: application/json' \
  -d '{"input":"ethereum:0x01C5C0122039549AD1493B8220cABEdD739BC44E@11142220/transfer?address=0x2222222222222222222222222222222222222222&uint256=10e18","network":"sepolia","expectedAmount":"10"}'
```

Response: `{ verdict: "no_firmes"|"revisa"|"ok", semaforo, resumen, intent, findings[], fee, simulated }`. The field names and verdict values are kept from the original API for compatibility; the text is in English.

### x402
With `X402_ENABLED=true`, `X402_PAY_TO` and `X402_API_KEY`, a request without `X-PAYMENT` gets **402** plus payment requirements for the Celo Sepolia facilitator; with a payment it calls `/verify` and `/settle`. Covered by unit tests with a mocked facilitator. No live payment has settled yet (the test payer has no testnet USDC). See `docs/TESTNET.md` and `.env.example`.

## Attribution tag (ERC-8021)
Every wallet client is built with `withAttribution('celo_ee3c13be2ff7')` from `@celo/attribution-tags` (`lib/wallet.ts`, `lib/serverWallet.ts`), so every tx carries the tag. A test checks it.

## Missing for mainnet
- Mainnet operating wallet and `X402_PAY_TO`.
- **ERC-8004** agent identity on Celo mainnet (testnet agentId 596 exists on Celo Sepolia).
- A live x402 settlement.
- Public HTTPS deploy and MiniPay listing.
- A list of known scam addresses.

## License
MIT
