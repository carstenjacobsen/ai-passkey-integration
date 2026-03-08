// POST /api/freighter/submit
// Submits a Freighter-signed XDR transaction to Horizon.
// Returns { hash } on success.
import { NextRequest, NextResponse } from "next/server";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

export async function POST(req: NextRequest) {
  try {
    const { xdr } = await req.json();

    if (!xdr) {
      return NextResponse.json({ error: "xdr is required" }, { status: 400 });
    }

    const params = new URLSearchParams({ tx: xdr });
    const res = await fetch(`${HORIZON_URL}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const text = await res.text();
    console.log(`[freighter/submit] ${res.status}\n${text}`);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: `Horizon error: ${text}` },
        { status: res.status }
      );
    }

    if (!res.ok) {
      const msg =
        (data.extras as { result_codes?: { transaction?: string } })?.result_codes
          ?.transaction ??
        (data as { detail?: string }).detail ??
        text;
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    return NextResponse.json({ hash: data.hash });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[freighter/submit] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
