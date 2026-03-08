// Funds the fee-payer account via Stellar testnet Friendbot.
// Call once during setup: GET /api/fund
import { NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk/minimal";

export async function GET() {
  const feePayerSecret = process.env.FEE_PAYER_SECRET;
  if (!feePayerSecret || feePayerSecret.startsWith("REPLACE")) {
    return NextResponse.json(
      { error: "FEE_PAYER_SECRET not configured in .env.local" },
      { status: 500 }
    );
  }

  const publicKey = Keypair.fromSecret(feePayerSecret).publicKey();

  try {
    const res = await fetch(
      `https://friendbot.stellar.org?addr=${publicKey}`
    );
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail ?? "Friendbot failed", publicKey },
        { status: res.status }
      );
    }

    return NextResponse.json({
      message: "Fee-payer account funded successfully",
      publicKey,
      txHash: data.hash,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
