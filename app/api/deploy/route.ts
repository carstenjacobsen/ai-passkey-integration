// Submits a wallet deployment transaction.
// The transaction is pre-signed by the passkey-kit seeder keypair.
// This route tries the OpenZeppelin Relayer first, then falls back to direct RPC.
import { NextRequest, NextResponse } from "next/server";
import { PasskeyServer } from "passkey-kit";
import { TransactionBuilder } from "@stellar/stellar-sdk/minimal";
import { server, NETWORK_PASSPHRASE } from "@/lib/stellar";

export async function POST(req: NextRequest) {
  try {
    const { xdr } = await req.json();
    if (!xdr) {
      return NextResponse.json({ error: "Missing xdr" }, { status: 400 });
    }

    const relayerUrl = process.env.RELAYER_URL;
    const relayerApiKey = process.env.RELAYER_API_KEY;

    if (relayerUrl && relayerApiKey) {
      // Use OpenZeppelin Channels relayer
      const passkeyServer = new PasskeyServer({
        rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL,
        relayerUrl,
        relayerApiKey,
      });
      const result = await passkeyServer.send(xdr);
      return NextResponse.json({ success: true, result });
    }

    // Fallback: direct RPC submission (works when the seeder account is funded on testnet)
    const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
    const sendResult = await server.sendTransaction(tx);

    if (sendResult.status === "ERROR") {
      return NextResponse.json(
        { error: sendResult.errorResult?.toString() ?? "Transaction failed" },
        { status: 400 }
      );
    }

    // Poll for completion
    const finalResult = await pollTransaction(sendResult.hash);
    return NextResponse.json({
      success: true,
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
  return { status: "TIMEOUT" };
}
