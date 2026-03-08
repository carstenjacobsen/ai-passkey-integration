// GET /api/etherfuse/order/:orderId
// Polls Etherfuse for the current order state.
// For off-ramp, poll until order.burnTransaction is populated, then sign + submit.
// Relevant status values: "created" | "funded" | "completed" | "failed" | "refunded" | "canceled"
import { NextRequest, NextResponse } from "next/server";

async function parseResponse(res: Response) {
  const text = await res.text();
  console.log(`[etherfuse] ${res.status} ${res.url}\n${text}`);
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text), text };
  } catch {
    return { ok: res.ok, status: res.status, data: null, text };
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    const apiKey = process.env.ETHERFUSE_API_KEY;
    const apiUrl =
      process.env.ETHERFUSE_API_URL ?? "https://api.sand.etherfuse.com/ramp";

    if (!apiKey) {
      return NextResponse.json(
        { error: "ETHERFUSE_API_KEY not configured in .env.local" },
        { status: 500 }
      );
    }

    const res = await fetch(`${apiUrl}/order/${orderId}`, {
      headers: {
        Authorization: apiKey,
        Accept: "application/json",
      },
    });

    const parsed = await parseResponse(res);
    if (!parsed.ok) {
      return NextResponse.json(
        {
          error: parsed.data
            ? (parsed.data.message ?? parsed.data.error ?? parsed.text)
            : parsed.text || "Failed to fetch order",
        },
        { status: parsed.status }
      );
    }

    return NextResponse.json(parsed.data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[etherfuse/order/:id] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
