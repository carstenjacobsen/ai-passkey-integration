// POST /api/etherfuse/order
// Creates an on-ramp or off-ramp order using a previously obtained quoteId.
// walletAddress: the smart wallet contract address (C...) used as the Stellar public key.
// On-ramp response includes a CLABE for the user to wire MXN.
// Off-ramp response includes only orderId; poll /api/etherfuse/order/:id for burnTransaction.
import { NextRequest, NextResponse } from "next/server";

function getConfig() {
  const apiKey = process.env.ETHERFUSE_API_KEY;
  const bankAccountId = process.env.ETHERFUSE_BANK_ACCOUNT_ID;
  const apiUrl =
    process.env.ETHERFUSE_API_URL ?? "https://api.sand.etherfuse.com/ramp";

  if (!apiKey)
    throw new Error("ETHERFUSE_API_KEY not configured in .env.local");
  if (!bankAccountId)
    throw new Error("ETHERFUSE_BANK_ACCOUNT_ID not configured in .env.local");

  return { apiKey, apiUrl, bankAccountId };
}

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
  if (parsed.data) return parsed.data.message ?? parsed.data.error ?? parsed.text;
  return parsed.text || "Unknown error from Etherfuse";
}

export async function POST(req: NextRequest) {
  try {
    const { quoteId, walletAddress } = await req.json();

    if (!quoteId || !walletAddress) {
      return NextResponse.json(
        { error: "quoteId and walletAddress are required" },
        { status: 400 }
      );
    }

    const { apiKey, apiUrl, bankAccountId } = getConfig();
    const orderId = crypto.randomUUID();

    const res = await fetch(`${apiUrl}/order`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        orderId,
        bankAccountId,
        publicKey: walletAddress,
        quoteId,
        blockchain: "stellar",
      }),
    });

    const parsed = await parseResponse(res);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: errorFrom(parsed) },
        { status: parsed.status }
      );
    }

    return NextResponse.json({ orderId, ...parsed.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[etherfuse/order] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
