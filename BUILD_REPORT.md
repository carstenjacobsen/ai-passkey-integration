# Stellar Passkey Wallet — Build Report

**Project:** `stellar-passkey-wallet`
**Stack:** Next.js 14, TypeScript, Tailwind CSS, Stellar Soroban
**Network:** Stellar Testnet
**Date completed:** 2026-03-08

---

## Overview

A browser-based Stellar smart wallet built on Soroban, using WebAuthn passkeys as the authentication primitive (no seed phrase). Also supports Freighter browser extension as an alternative login. Includes an Etherfuse on/off-ramp for MXN ↔ CETES.

---

## Architecture

```
Next.js 14 App Router
├── lib/
│   ├── passkey.ts          — passkey-kit SDK setup (kit, native SAC client)
│   ├── wallet-context.tsx  — React context: state + actions for passkey & Freighter
│   ├── freighter.ts        — @stellar/freighter-api v6 wrappers
│   └── utils.ts            — XLM ↔ stroops conversions, address truncation
├── app/api/
│   ├── deploy/             — Submit wallet deployment transaction
│   ├── build/              — Build Soroban SAC transfer XDR (fee-payer as source)
│   ├── send/               — Sign with fee-payer + submit to Soroban RPC
│   ├── trustline/          — Classic ChangeTrust via Horizon
│   ├── freighter/
│   │   ├── build/          — Build classic Payment XDR for Freighter accounts
│   │   └── submit/         — Submit Freighter-signed XDR to Horizon
│   └── etherfuse/
│       ├── quote/          — MXN↔CETES quote (with auto wallet registration)
│       ├── order/          — Create on/off-ramp order
│       ├── order/[id]/     — Poll order status
│       └── wallet/         — Register fee-payer G... key with Etherfuse
└── components/
    ├── CreateWallet.tsx     — Register new passkey wallet
    ├── ConnectWallet.tsx    — Reconnect existing passkey wallet
    ├── ConnectFreighter.tsx — Connect via Freighter extension
    ├── Dashboard.tsx        — Tabbed wallet UI (send / receive / assets / ramp)
    ├── SendXLM.tsx          — Passkey send flow (Soroban SAC transfer)
    ├── FreighterSend.tsx    — Freighter send flow (classic Payment)
    ├── ReceiveXLM.tsx       — QR code + address display
    ├── TrustlineForm.tsx    — Create trustline on fee-payer account
    ├── OnRamp.tsx           — MXN → CETES flow
    └── OffRamp.tsx          — CETES → MXN flow
```

---

## Features

| Feature | Description |
|---|---|
| Passkey wallet creation | WebAuthn registration → Soroban smart wallet deployment |
| Passkey login | WebAuthn authentication → reconnect to existing smart wallet |
| Freighter login | Freighter browser extension → classic G... account |
| XLM balance | Passkey: SAC `balance()` call; Freighter: Horizon account query |
| Send XLM (passkey) | Soroban SAC transfer — passkey signs auth entry, fee-payer signs envelope |
| Send XLM (Freighter) | Classic Payment — Freighter signs full envelope, submit to Horizon |
| Receive XLM | QR code + copy address |
| Create trustline | Classic `ChangeTrust` on fee-payer account → Horizon |
| On-ramp (MXN → CETES) | Etherfuse quote → order → CLABE bank transfer display |
| Off-ramp (CETES → MXN) | Etherfuse quote → order → passkey signs burn tx → Soroban submit |

---

## Issues & Gotchas Discovered

### 1. WebAuthn rejects IP addresses as rpId

**Error:** `127.0.0.1 is an invalid domain`

**Cause:** The WebAuthn spec requires a valid domain name as the `rpId`. Browsers reject IP addresses (including `127.0.0.1`) outright before passkey-kit even gets the error.

**Fix:** Access the app at `http://localhost:3000`, not `http://127.0.0.1:3000`. Also added a `getRpId()` helper in `wallet-context.tsx` that forces `rpId = "localhost"` when the browser is on `127.0.0.1`, as a belt-and-suspenders guard.

---

### 2. Generic "Wallet creation failed" with no detail

**Error:** `Wallet creation failed` (catch block falling through to generic message)

**Cause:** The thrown value was not an `Error` instance — passkey-kit was throwing a plain object. The original catch block only handled `err instanceof Error`.

**Fix:** Extended the error serialization in the catch block:
```typescript
const msg = err instanceof Error ? err.message
  : typeof err === "string" ? err
  : (JSON.stringify(err) ?? "Wallet creation failed");
```
Also added `console.error("createWallet error:", err)` for server-log visibility.

---

### 3. Wallet WASM hash was wrong (65 chars instead of 64)

**Error:** `{"code":404,"message":"Could not obtain contract wasm from server"}`

**Cause:** The `NEXT_PUBLIC_WALLET_WASM_HASH` value in `.env.local` had 65 hex characters — one character too many. Stellar WASM hashes are exactly 32 bytes = 64 hex chars.

**Fix:** Fetched the canonical values from the passkey-kit GitHub repo. Correct values:
```
NEXT_PUBLIC_WALLET_WASM_HASH=ecd990f0b45ca6817149b6175f79b32efb442f35731985a084131e8265c4cd90
NEXT_PUBLIC_NATIVE_SAC_CONTRACT_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

The SAC contract ID was also wrong (57 chars instead of 56 — Stellar contract IDs are 56 chars in Strkey encoding).

---

### 4. Fee-payer account not funded

**Error:** `FEE_PAYER_SECRET not configured in .env.local`

**Cause:** `.env.local` had a placeholder value. The passkey wallet architecture requires a server-side funded Stellar account to pay transaction fees for the smart wallet.

**Fix:** Generated a new keypair with `stellar-sdk`, funded via Friendbot (`https://friendbot.stellar.org/?addr=...`), and stored the secret in `.env.local`.

---

### 5. Etherfuse API returns plain text errors, not JSON

**Error:** `Unexpected token 'W', "Wallet add..." is not valid JSON`

**Cause:** Etherfuse returns plain text responses for certain error conditions (e.g. `"Wallet address is not valid..."`), but the original route handlers called `res.json()` unconditionally.

**Fix:** Replaced all Etherfuse API calls with a `parseResponse()` helper across all three routes:
```typescript
async function parseResponse(res: Response) {
  const text = await res.text();
  console.log(`[etherfuse] ${res.status} ${res.url}\n${text}`);
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text), text }; }
  catch { return { ok: res.ok, status: res.status, data: null, text }; }
}
```

---

### 6. Etherfuse rejects Soroban C... contract addresses

**Error:** `Wallet address 'CDH3U5...' is not valid for blockchain 'stellar'`

**Cause:** Etherfuse's wallet API only accepts classic Stellar G... (Ed25519) addresses. Soroban contract addresses start with C... and use a different Strkey format — Etherfuse's validation rejects them.

**Fix:** Changed the Etherfuse integration to use the **fee-payer's public key** (G...) as the Etherfuse wallet identity instead of the smart contract address:
1. Derive `feePayerPublicKey` from `FEE_PAYER_SECRET` server-side
2. Call `ensureWalletRegistered()` before every quote (idempotent — 409 = already registered)
3. Return `feePayerPublicKey` in the quote response
4. `OnRamp` and `OffRamp` components pass `quote.feePayerPublicKey` to order creation

---

### 7. Classic vs Soroban transaction routing

**Gotcha:** Stellar has two parallel transaction systems that do not mix:

| Operation | Build with | Submit to |
|---|---|---|
| Soroban contract call (SAC transfer) | `StellarSdk` + Soroban RPC simulation | Soroban RPC (`sendTransaction`) |
| Classic payment / ChangeTrust | `TransactionBuilder` | Horizon (`/transactions`) |

Submitting a classic operation to Soroban RPC (or vice versa) silently fails or returns cryptic errors. The `ChangeTrust` (trustline) feature and the Freighter `Payment` must go to Horizon. The passkey SAC transfer goes to Soroban RPC.

---

### 8. `@stellar/stellar-sdk/minimal` exports

**Gotcha:** Server-side API routes use `@stellar/stellar-sdk/minimal` to avoid importing the full SDK (which pulls in browser globals). This subpath re-exports `@stellar/stellar-base`, so `Operation`, `Asset`, `Account`, `TransactionBuilder`, `Keypair`, and `BASE_FEE` are all available — but only those primitives. Higher-level Soroban helpers are not.

---

### 9. `@stellar/freighter-api` v6 API changed

**Gotcha:** The API changed significantly across major versions. In v6.x:
- `getPublicKey()` is gone → replaced by `getAddress()` returning `{ address: string; error? }`
- `signTransaction()` returns `{ signedTxXdr: string; signerAddress: string; error? }` (not `signedPayload`)
- All functions return result objects; errors come as `{ error: { code, message } }` rather than thrown exceptions

The code was written against the v6 source after reading `node_modules` directly to avoid guessing.

---

### 10. Freighter accounts use Horizon for balance, not Soroban

**Gotcha:** The passkey smart wallet holds XLM via the SAC (Stellar Asset Contract), so balance is queried via a Soroban read call (`native.balance({ id: contractId })`). A Freighter account is a classic Stellar account — its balance lives in Horizon's ledger state. Querying the SAC with a G... address would return 0 or an error.

**Fix:** `refreshBalance()` in `wallet-context.tsx` branches on `walletType`:
- `"passkey"` → SAC balance call
- `"freighter"` → `GET https://horizon-testnet.stellar.org/accounts/{publicKey}` → parse `balances[].asset_type === "native"`

---

## Environment Variables

```env
# Wallet contract (from passkey-kit GitHub releases)
NEXT_PUBLIC_WALLET_WASM_HASH=ecd990f0b45ca6817149b6175f79b32efb442f35731985a084131e8265c4cd90
NEXT_PUBLIC_NATIVE_SAC_CONTRACT_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC

# Server-side fee-payer keypair (funded via Friendbot)
FEE_PAYER_SECRET=SAJOXUNE4S46I2Y5RD2X77WNFR3QSQYBNGPBEMQJCY4FYQ6IJYEBGKHX

# Etherfuse sandbox credentials
ETHERFUSE_API_URL=https://api.sand.etherfuse.com/ramp
ETHERFUSE_API_KEY=api_sand:...
ETHERFUSE_CUSTOMER_ID=...
ETHERFUSE_BANK_ACCOUNT_ID=...
```

---

## Key Design Decisions

**Fee-payer pattern:** The smart wallet (C... address) has no classic Stellar account, so it cannot pay fees directly. A separate server-side G... keypair pays all network fees and signs the outer transaction envelope. The passkey only signs the inner Soroban auth entry.

**Two-layer signing (passkey wallet):**
1. `kit.sign(xdr)` — user's WebAuthn credential signs the Soroban authorization entry (proves intent)
2. Server-side keypair signs the outer envelope (pays fees and satisfies Stellar's signature requirement)

**Freighter sends as classic payments:** Freighter accounts are classic Stellar accounts. XLM transfers use `Operation.payment()` submitted to Horizon, not the SAC `transfer()` Soroban call.

**Etherfuse uses fee-payer identity:** Since Etherfuse requires a classic G... address and the passkey wallet is a C... contract, the server's fee-payer G... key acts as the Etherfuse wallet identity for both on-ramp and off-ramp.
