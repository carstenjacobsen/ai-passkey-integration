// POST /api/freighter/build
// Builds an unsigned classic Payment transaction for a Freighter account.
// Returns the XDR string for Freighter to sign.
import { NextRequest, NextResponse } from "next/server";
import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Account,
  BASE_FEE,
} from "@stellar/stellar-sdk/minimal";

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
const HORIZON_URL = "https://horizon-testnet.stellar.org";

export async function POST(req: NextRequest) {
  try {
    const { from, to, amount } = await req.json();

    if (!from || !to || !amount) {
      return NextResponse.json(
        { error: "from, to, and amount are required" },
        { status: 400 }
      );
    }

    // Validate addresses
    try {
      Keypair.fromPublicKey(from);
      Keypair.fromPublicKey(to);
    } catch {
      return NextResponse.json(
        { error: "Invalid Stellar address" },
        { status: 400 }
      );
    }

    // Fetch account from Horizon to get sequence number
    const accountRes = await fetch(`${HORIZON_URL}/accounts/${from}`);
    if (!accountRes.ok) {
      const text = await accountRes.text();
      return NextResponse.json(
        { error: `Failed to load account: ${text}` },
        { status: 400 }
      );
    }
    const accountData = await accountRes.json();
    const account = new Account(from, accountData.sequence);

    // Amount comes in as stroops (string); convert to XLM string for Operation.payment
    const amountXlm = (BigInt(amount) / 10_000_000n).toString() +
      "." +
      (BigInt(amount) % 10_000_000n).toString().padStart(7, "0");

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: to,
          asset: Asset.native(),
          amount: amountXlm,
        })
      )
      .setTimeout(30)
      .build();

    return NextResponse.json({ xdr: tx.toEnvelope().toXDR("base64") });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[freighter/build] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
