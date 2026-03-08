// Receives passkey-signed transaction XDR, signs the outer envelope
// with the fee-payer keypair, and submits to the Stellar network.
import { NextRequest, NextResponse } from "next/server";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk/minimal";
import { assembleTransaction } from "@stellar/stellar-sdk/rpc";
import { server, NETWORK_PASSPHRASE } from "@/lib/stellar";

export async function POST(req: NextRequest) {
  try {
    const { xdr } = await req.json();
    if (!xdr) {
      return NextResponse.json({ error: "Missing xdr" }, { status: 400 });
    }

    const feePayerSecret = process.env.FEE_PAYER_SECRET;
    if (!feePayerSecret || feePayerSecret.startsWith("REPLACE")) {
      return NextResponse.json(
        { error: "FEE_PAYER_SECRET not configured in .env.local" },
        { status: 500 }
      );
    }

    const feePayerKeypair = Keypair.fromSecret(feePayerSecret);

    // Reconstruct the transaction from the client-signed XDR
    // At this point, the auth entry (Soroban authorization) is signed by the passkey.
    const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);

    // Re-simulate in enforcing mode to get the final resource fee
    const simResult = await server.simulateTransaction(tx);
    if ("error" in simResult) {
      return NextResponse.json(
        { error: `Simulation failed: ${simResult.error}` },
        { status: 400 }
      );
    }

    const assembled = assembleTransaction(tx, simResult);
    const finalTx = assembled.build();

    // Sign the outer transaction envelope with the fee-payer keypair
    finalTx.sign(feePayerKeypair);

    // Submit to Stellar
    const sendResult = await server.sendTransaction(finalTx);

    if (sendResult.status === "ERROR") {
      return NextResponse.json(
        {
          error:
            sendResult.errorResult?.toString() ??
            "Transaction submission failed",
        },
        { status: 400 }
      );
    }

    // Poll for completion (up to ~40 seconds)
    const finalResult = await pollTransaction(sendResult.hash);
    return NextResponse.json({
      hash: sendResult.hash,
      status: finalResult.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function pollTransaction(hash: string, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await server.getTransaction(hash);
    if (result.status !== "NOT_FOUND") return result;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { status: "TIMEOUT" } as const;
}
