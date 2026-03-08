// POST /api/etherfuse/wallet
// Registers the fee-payer's classic G... Stellar address with Etherfuse.
// Etherfuse only accepts classic ed25519 public keys (G...), not Soroban
// contract addresses (C...). Call this once before quoting or ordering.
// Safe to call repeatedly — Etherfuse treats duplicate registrations as no-ops.
import { NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk/minimal";

async function parseResponse(res: Response) {
  const text = await res.text();
  console.log(`[etherfuse/wallet] ${res.status} ${res.url}\n${text}`);
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text), text };
  } catch {
    return { ok: res.ok, status: res.status, data: null, text };
  }
}

export async function POST() {
  try {
    const apiKey = process.env.ETHERFUSE_API_KEY;
    const apiUrl =
      process.env.ETHERFUSE_API_URL ?? "https://api.sand.etherfuse.com/ramp";
    const feePayerSecret = process.env.FEE_PAYER_SECRET;

    if (!apiKey)
      return NextResponse.json(
        { error: "ETHERFUSE_API_KEY not configured" },
        { status: 500 }
      );
    if (!feePayerSecret || feePayerSecret === "REPLACE_WITH_YOUR_FUNDED_TESTNET_SECRET_KEY")
      return NextResponse.json(
        { error: "FEE_PAYER_SECRET not configured" },
        { status: 500 }
      );

    const publicKey = Keypair.fromSecret(feePayerSecret).publicKey();

    const res = await fetch(`${apiUrl}/wallet`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ publicKey, blockchain: "stellar" }),
    });

    const parsed = await parseResponse(res);

    // 409 Conflict = already registered — treat as success
    if (!parsed.ok && parsed.status !== 409) {
      const msg = parsed.data
        ? (parsed.data.message ?? parsed.data.error ?? parsed.text)
        : parsed.text || "Wallet registration failed";
      return NextResponse.json({ error: msg }, { status: parsed.status });
    }

    return NextResponse.json({ publicKey });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[etherfuse/wallet] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
