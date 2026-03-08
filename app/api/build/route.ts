// Builds and simulates a SAC transfer transaction with the fee-payer as source.
// Returns the assembled (unsigned) XDR for the client to sign with passkey.
import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk/minimal";
import { Client as SacClient } from "sac-sdk";
import { NETWORK_PASSPHRASE, NATIVE_SAC_CONTRACT_ID, RPC_URL } from "@/lib/stellar";

export async function POST(req: NextRequest) {
  try {
    const { from, to, amount } = await req.json();

    if (!from || !to || !amount) {
      return NextResponse.json(
        { error: "Missing from, to, or amount" },
        { status: 400 }
      );
    }

    const feePayerSecret = process.env.FEE_PAYER_SECRET;
    if (!feePayerSecret || feePayerSecret.startsWith("REPLACE")) {
      return NextResponse.json(
        { error: "FEE_PAYER_SECRET not configured in .env.local" },
        { status: 500 }
      );
    }

    const feePayerKeypair = Keypair.fromSecret(feePayerSecret);

    // Create a SAC client with the fee-payer as the outer transaction source
    const sacClient = new SacClient({
      contractId: NATIVE_SAC_CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: feePayerKeypair.publicKey(),
    });

    // Build + simulate the transfer. Amount is bigint in stroops.
    const assembledTx = await sacClient.transfer({
      from,
      to,
      amount: BigInt(amount),
    });

    // The assembled transaction has:
    // - fee-payer as the source account (for sequence number / outer fee)
    // - auth entry placeholder for the smart wallet (passkey will sign this)
    return NextResponse.json({ xdr: assembledTx.built!.toXDR() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
