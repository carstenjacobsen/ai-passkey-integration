// POST /api/etherfuse/quote
// Gets a price quote from the Etherfuse Ramp API.
// type: "onramp"  → MXN → CETES  (sourceAmount in MXN)
// type: "offramp" → CETES → MXN  (sourceAmount in CETES)
import { NextRequest, NextResponse } from "next/server";

import { Keypair } from "@stellar/stellar-sdk/minimal";

function getConfig() {
  const apiKey = process.env.ETHERFUSE_API_KEY;
  const customerId = process.env.ETHERFUSE_CUSTOMER_ID;
  const feePayerSecret = process.env.FEE_PAYER_SECRET;
  const apiUrl =
    process.env.ETHERFUSE_API_URL ?? "https://api.sand.etherfuse.com/ramp";
  const cetesId =
    process.env.ETHERFUSE_CETES_IDENTIFIER ??
    "CETES:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4";

  if (!apiKey)
    throw new Error("ETHERFUSE_API_KEY not configured in .env.local");
  if (!customerId)
    throw new Error("ETHERFUSE_CUSTOMER_ID not configured in .env.local");
  if (!feePayerSecret || feePayerSecret === "REPLACE_WITH_YOUR_FUNDED_TESTNET_SECRET_KEY")
    throw new Error("FEE_PAYER_SECRET not configured in .env.local");

  const feePayerPublicKey = Keypair.fromSecret(feePayerSecret).publicKey();
  return { apiKey, apiUrl, customerId, cetesId, feePayerPublicKey };
}

/** Ensure the fee-payer G... address is registered with Etherfuse before quoting. */
async function ensureWalletRegistered(
  apiUrl: string,
  apiKey: string,
  publicKey: string
) {
  const res = await fetch(`${apiUrl}/wallet`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ publicKey, blockchain: "stellar" }),
  });
  const text = await res.text();
  console.log(`[etherfuse/wallet-reg] ${res.status}\n${text}`);
  // 409 = already registered → fine
  if (!res.ok && res.status !== 409) {
    console.warn("[etherfuse/wallet-reg] unexpected status:", res.status, text);
  }
}

/** Safely parse an Etherfuse response — returns { ok, status, data, text } */
async function parseResponse(res: Response) {
  const text = await res.text();
  console.log(`[etherfuse] ${res.status} ${res.url}\n${text}`);
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text), text };
  } catch {
    return { ok: res.ok, status: res.status, data: null, text };
  }
}

function errorFrom(parsed: Awaited<ReturnType<typeof parseResponse>>) {
  if (parsed.data) {
    return parsed.data.message ?? parsed.data.error ?? parsed.text;
  }
  return parsed.text || "Unknown error from Etherfuse";
}

export async function POST(req: NextRequest) {
  try {
    const { type, sourceAmount } = await req.json();

    if (!type || !sourceAmount) {
      return NextResponse.json(
        { error: "type and sourceAmount are required" },
        { status: 400 }
      );
    }
    if (type !== "onramp" && type !== "offramp") {
      return NextResponse.json(
        { error: 'type must be "onramp" or "offramp"' },
        { status: 400 }
      );
    }

    const { apiKey, apiUrl, customerId, cetesId, feePayerPublicKey } = getConfig();

    // Register the fee-payer G... address with Etherfuse (idempotent)
    await ensureWalletRegistered(apiUrl, apiKey, feePayerPublicKey);

    const quoteId = crypto.randomUUID();

    const quoteAssets =
      type === "onramp"
        ? { type: "onramp", sourceAsset: "MXN", targetAsset: cetesId }
        : { type: "offramp", sourceAsset: cetesId, targetAsset: "MXN" };

    const res = await fetch(`${apiUrl}/quote`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        quoteId,
        customerId,
        blockchain: "stellar",
        quoteAssets,
        sourceAmount: String(sourceAmount),
      }),
    });

    const parsed = await parseResponse(res);

    if (!parsed.ok) {
      return NextResponse.json(
        { error: errorFrom(parsed) },
        { status: parsed.status }
      );
    }

    // Include the fee-payer public key so the client passes the correct
    // G... address (not the C... contract address) to the order endpoint.
    return NextResponse.json({ ...parsed.data, feePayerPublicKey });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[etherfuse/quote] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
