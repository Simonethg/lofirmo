# ¿Lo firmo?

**ES** · Mini App para MiniPay (Celo) que revisa un pago **antes de firmarlo**. Pegás una dirección o un link de pago (o escaneás un QR dentro de MiniPay) y te devuelve un semáforo con la explicación en español.
**EN** · MiniPay (Celo) mini app that reviews a payment **before you sign it**. Paste an address or payment link (or scan a QR inside MiniPay) and get a traffic-light verdict explained in Spanish.

Proyecto para la hackatón *Agents on Open Rails* (Celo). Red actual: **Celo Sepolia**. Mainnet: configurado pero **sin envíos** (`MAINNET_SENDS_ENABLED = false`).

## Qué detecta / What it checks

| ID | ES | EN |
|---|---|---|
| CELO-001 | Decimales equivocados: USDC/USDT/USA₮ tienen 6, USDm 18 | Wrong decimals (6 vs 18) |
| AMOUNT_MISMATCH | El monto no coincide con lo que esperabas pagar | Amount differs from the expected one |
| UNLIMITED_APPROVE | `approve` ilimitado | Unlimited approve |
| CELO-002 | `feeCurrency` apunta al token y no al adapter | feeCurrency set to token instead of adapter |
| CELO-003 | Dirección del adapter usada como token | Adapter address used as the token |
| NEW_RECIPIENT | Destinatario sin historial on-chain | Recipient with no on-chain history |
| SEND_TO_TOKEN | Destino = contrato de token | Sending to a token contract |
| WRONG_CHAIN | Link para otra red | Link for another chain |
| SIMULATION_REVERT / INSUFFICIENT_BALANCE | Simulación con viem (`eth_call`) si hay remitente | viem simulation when `from` is known |
| FEE | Network fee estimada en la stablecoin (`eth_gasPrice` con `feeCurrency`) | Network fee quoted in the stablecoin |

Las direcciones de tokens/adapters y las reglas CELO-00x vienen de [docs.celo.org fee currencies](https://docs.celo.org/build/tools/contracts/fee-currencies) y están portadas a TypeScript desde las reglas Celo de [arcguard](https://github.com/Simonethg/arcguard) (PR #3).
Token/adapter addresses and the CELO-00x rules come from the Celo docs and are ported to TS from arcguard's Celo detectors.

## Uso / Usage

```bash
npm install
npm run dev        # http://localhost:3000
npm test
```

Para probar en MiniPay: activá *Developer mode* y cargá la URL (por ejemplo con un túnel ngrok). La app detecta `window.ethereum.isMiniPay`, toma la dirección sin pedir firma y usa `scanQrCode` para el QR.
To test in MiniPay enable Developer mode and load your tunnelled URL.

### Entradas aceptadas / Accepted input
- Dirección: `0x…`
- Link EIP-681: `ethereum:<token>@11142220/transfer?address=<dest>&uint256=10e6`
- JSON de tx: `{"to":"0x…","data":"0x…","from":"0x…","feeCurrency":"0x…"}`
- `<to>:<calldata>`

## API

`POST /api/check` (o `GET /api/check?input=…`)

```bash
curl -X POST localhost:3000/api/check -H 'content-type: application/json' \
  -d '{"input":"ethereum:0x01C5C0122039549AD1493B8220cABEdD739BC44E@11142220/transfer?address=0x2222222222222222222222222222222222222222&uint256=10e18","network":"sepolia","expectedAmount":"10"}'
```

Respuesta / Response: `{ verdict: "no_firmes"|"revisa"|"ok", semaforo, resumen, intent, findings[], fee, simulated }`.

### x402 (stub)
Con `X402_ENABLED=true` y `X402_PAY_TO=<dirección pública>`, sin header `X-PAYMENT` devuelve **402** con los requisitos de pago para el facilitator de Celo (`https://x402.celo.org`). La verificación/liquidación real todavía no está implementada (responde 501). No hacen falta claves. Ver `.env.example`.
With x402 enabled the endpoint answers 402 with payment requirements for x402.celo.org; real verify/settle is a TODO.

## Attribution tag (ERC-8021)
Toda wallet client se construye en `lib/wallet.ts` con `withAttribution('celo_ee3c13be2ff7')` de `@celo/attribution-tags`, así **cada** tx lleva el tag. Hay un test que lo verifica.
Every wallet client is built with `withAttribution(...)`, so every tx carries the hackathon tag (covered by a test).

## Pendiente para mainnet / Missing for mainnet
- Wallet de deploy/operación y `X402_PAY_TO` (dirección pública).
- Registro de identidad del agente **ERC-8004** en Celo mainnet.
- x402: verificación y `settle` contra `x402.celo.org` (API key).
- Deploy público (HTTPS) + alta en MiniPay.
- Lista de direcciones marcadas como estafa.

## Licencia / License
MIT
