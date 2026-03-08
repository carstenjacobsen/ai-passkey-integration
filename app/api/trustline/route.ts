// Builds, signs, and submits a ChangeTrust operation on the fee-payer classic account.
// Classic Stellar assets require a trustline before they can be held.
// Soroban smart wallet contracts hold assets via SAC (no trustline needed),
// but the fee-payer relay account uses this to bridge classic assets.
import { NextRequest, NextResponse } from "next/server";
import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Account,
  BASE_FEE,
} from "@stellar/stellar-sdk/minimal";
import { NETWORK_PASSPHRASE } from "@/lib/stellar";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

export async function POST(req: NextRequest) {
  try {
    const { assetCode, issuer, limit } = await req.json();

    if (!assetCode || !issuer) {
      return NextResponse.json(
        { error: "assetCode and issuer are required" },
        { status: 400 }
      );
    }

    if (!/^[A-Za-z0-9]{1,12}$/.test(assetCode)) {
      return NextResponse.json(
        { error: "Invalid asset code — 1 to 12 alphanumeric characters" },
        { status: 400 }
      );
    }

    const feePayerSecret = process.env.FEE_PAYER_SECRET;
    if (
      !feePayerSecret ||
      feePayerSecret === "REPLACE_WITH_YOUR_FUNDED_TESTNET_SECRET_KEY"
    ) {
      return NextResponse.json(
        { error: "FEE_PAYER_SECRET not configured in .env.local" },
        { status: 500 }
      );
    }

    const feePayerKeypair = Keypair.fromSecret(feePayerSecret);

    // Fetch account state (sequence number) from Horizon
    const accountRes = await fetch(
      `${HORIZON_URL}/accounts/${feePayerKeypair.publicKey()}`
    );
    if (!accountRes.ok) {
      return NextResponse.json(
        { error: "Could not load fee-payer account from Horizon" },
        { status: 500 }
      );
    }
    const accountData = await accountRes.json();
    const account = new Account(accountData.id, accountData.sequence);

    const asset = new Asset(assetCode.toUpperCase().trim(), issuer.trim());

    // Build the ChangeTrust transaction
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.changeTrust({
          asset,
          // undefined → SDK uses the maximum trustline limit
          limit: limit ? String(limit) : undefined,
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(feePayerKeypair);

    // Submit to Horizon (classic ops go to Horizon, not Soroban RPC)
    const xdr = tx.toEnvelope().toXDR("base64");
    const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ tx: xdr }),
    });

    const submitData = await submitRes.json();
    if (!submitRes.ok) {
      const opCode =
        submitData?.extras?.result_codes?.operations?.[0];
      const txCode = submitData?.extras?.result_codes?.transaction;
      const detail =
        opCode ?? txCode ?? submitData?.title ?? "Transaction failed";
      return NextResponse.json({ error: detail }, { status: 400 });
    }

    return NextResponse.json({ success: true, hash: submitData.hash });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
