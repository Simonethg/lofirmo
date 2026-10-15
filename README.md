# Vigía (Celo)

Vigía checks a Celo payment **automatically, before it is sent**. Nobody pastes anything.

- **Check API (the main product).** Payment apps, merchants, wallets and agents call `POST /api/check` from their own code before sending a payment, and can pay per check with x402. The person only sees a warning when something is wrong.
- **MiniPay deep link.** A payment link opens directly in the mini app at `/pay?link=…`. Vigía checks it on load and shows **Pay** only if the check passes. Otherwise it shows the warning instead.

Vigía is one security product with one brand across Arc, Base and Celo. This repo is the Celo version (formerly "¿Lo firmo?"). The repo keeps the name `lofirmo` because the ERC-8004 agent registration points to it.

Built for the *Agents on Open Rails* hackathon (Celo). Current network: **Celo Sepolia (testnet)**. Mainnet is configured but **sends are disabled** (`MAINNET_SENDS_ENABLED = false`). No x402 payment has settled live yet.

## Call it from code

`POST /api/check` with a JSON body:

| Field | Type | |
|---|---|---|
| `input` | string | a payment link (`ethereum:` / `celo:`), an address, or `<to>:<calldata>` |
| `tx` | object | instead of `input`: an unsigned tx `{ to, data, value, from, feeCurrency }` |
| `expectedAmount` | string | optional, what the payer expects to pay in token units, e.g. `"10"` |
| `network` | `"sepolia"` \| `"mainnet"` | optional, defaults to the server's network |

The response is `{ verdict, resumen, findings[], intent, fee, simulated, ... }`. `verdict` is `"ok"`, `"revisa"` (review) or `"no_firmes"` (don't sign). The field names are kept from the original API for compatibility; the text is in English.

```js
const res = await fetch('https://<your-vigia-host>/api/check', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ input: paymentLink, expectedAmount: '10' }),
})
const r = await res.json()
if (r.verdict === 'ok') await sendPayment()
else showWarning(r.resumen, r.findings) // e.g. "Don't sign it." + CELO-001, AMOUNT_MISMATCH
```

Or use the tiny helper in `lib/client.ts`:

```ts
import { checkPayment, PaymentRequired } from './lib/client'
const r = await checkPayment('https://<your-vigia-host>', { input: paymentLink, expectedAmount: '10' })
```

With x402 enabled, a call without payment gets `402` plus the requirements (`PaymentRequired` in the helper). Pass a signed `X-PAYMENT` header (`{ xPayment }`) to pay per check. `scripts/x402-pay.ts` is a buyer example.

## MiniPay: `/pay?link=…`

`/pay?link=<payment link>&amount=<expected amount, optional>` opens straight from the link, with no paste step. It calls `/api/check` on load:
- `ok`: shows **Pay 10 USDC**. In MiniPay it sends exactly the checked transfer, with the stablecoin's fee adapter and the ERC-8021 tag.
- `revisa`: shows the warning. Paying needs an extra "I know this recipient" tap.
- `no_firmes`: shows the warning and no pay button.

The home page (`/`) is still there as a manual checker for testing.

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

To test in MiniPay, enable *Developer mode* and load your URL (for example through an ngrok tunnel), e.g. `https://<tunnel>/pay?link=ethereum:…`. The app detects `window.ethereum.isMiniPay`, reads the address without asking for a signature, and uses `scanQrCode` for QR codes.

### Accepted input
- Address: `0x…`
- EIP-681 link: `ethereum:<token>@11142220/transfer?address=<dest>&uint256=10e6`
- Tx JSON: `{"to":"0x…","data":"0x…","from":"0x…","feeCurrency":"0x…"}`
- `<to>:<calldata>`

## x402 details
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
