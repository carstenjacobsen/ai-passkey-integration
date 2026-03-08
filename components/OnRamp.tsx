"use client";

import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/lib/wallet-context";
import Button from "./ui/Button";
import Input from "./ui/Input";
import Spinner from "./ui/Spinner";

type Phase =
  | "idle"
  | "quoting"
  | "quoted"
  | "ordering"
  | "awaiting_payment"
  | "error";

interface Quote {
  quoteId: string;
  sourceAmount: string;
  destinationAmount: string;
  destinationAmountAfterFee: string;
  feeAmount: string;
  feeBps: string;
  exchangeRate: string;
  expiresAt: string;
  feePayerPublicKey: string; // G... address returned by our quote API
}

export default function OnRamp() {
  const { contractId } = useWallet();
  const [mxnAmount, setMxnAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clabe, setClabe] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown for quote expiry (2-minute TTL)
  useEffect(() => {
    if (!quote?.expiresAt) return;
    const tick = () => {
      const secs = Math.max(
        0,
        Math.floor((new Date(quote.expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(secs);
      if (secs === 0) {
        setPhase("idle");
        setQuote(null);
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [quote?.expiresAt]);

  const handleGetQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("quoting");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/etherfuse/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "onramp", sourceAmount: mxnAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuote(data);
      setPhase("quoted");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Quote failed");
      setPhase("error");
    }
  };

  const handleConfirm = async () => {
    if (!quote) return;
    setPhase("ordering");
    try {
      const res = await fetch("/api/etherfuse/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          // Use the fee-payer G... address — Etherfuse rejects C... contract addresses
          walletAddress: quote.feePayerPublicKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrderId(data.orderId ?? data.onramp?.orderId ?? null);
      setClabe(data.depositClabe ?? data.onramp?.depositClabe ?? null);
      setDepositAmount(
        data.depositAmount ?? data.onramp?.depositAmount ?? null
      );
      setPhase("awaiting_payment");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Order failed");
      setPhase("error");
    }
  };

  const handleReset = () => {
    setPhase("idle");
    setQuote(null);
    setOrderId(null);
    setClabe(null);
    setDepositAmount(null);
    setErrorMsg(null);
    setMxnAmount("");
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const fmt = (n: string | number) =>
    Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 7 });

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (phase === "idle" || phase === "quoting") {
    return (
      <form onSubmit={handleGetQuote} className="flex flex-col gap-4">
        <p className="text-xs text-gray-400 leading-relaxed">
          Buy CETES with MXN. Enter the amount of pesos you want to spend and
          we&apos;ll show you a quote.
        </p>
        <Input
          label="Amount (MXN)"
          type="number"
          placeholder="1000"
          value={mxnAmount}
          onChange={(e) => setMxnAmount(e.target.value)}
          min="1"
          step="0.01"
          required
          disabled={phase === "quoting"}
        />
        <Button type="submit" loading={phase === "quoting"} className="w-full">
          {phase === "quoting" ? "Getting quote…" : "Get Quote"}
        </Button>
      </form>
    );
  }

  // ── Quote ─────────────────────────────────────────────────────────────────
  if (phase === "quoted" && quote) {
    const expired = secondsLeft === 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-gray-800/60 border border-gray-700 divide-y divide-gray-700">
          <Row label="You pay" value={`MXN ${fmt(quote.sourceAmount)}`} />
          <Row
            label="You receive"
            value={`${fmt(quote.destinationAmountAfterFee)} CETES`}
            highlight
          />
          <Row label="Exchange rate" value={`1 CETES = MXN ${fmt(quote.exchangeRate)}`} />
          <Row
            label="Fee"
            value={`MXN ${fmt(quote.feeAmount)} (${quote.feeBps} bps)`}
          />
          <Row
            label="Quote expires"
            value={
              expired ? (
                <span className="text-red-400">Expired</span>
              ) : (
                <span className={secondsLeft < 30 ? "text-yellow-400" : "text-gray-300"}>
                  {secondsLeft}s
                </span>
              )
            }
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleReset}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={expired}
            className="flex-1"
          >
            Confirm
          </Button>
        </div>
      </div>
    );
  }

  // ── Ordering ──────────────────────────────────────────────────────────────
  if (phase === "ordering") {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <Spinner />
        <p className="text-sm text-gray-400">Creating order…</p>
      </div>
    );
  }

  // ── Awaiting bank transfer ────────────────────────────────────────────────
  if (phase === "awaiting_payment") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-green-900/20 border border-green-700 p-4">
          <p className="text-sm font-semibold text-green-400 mb-1">
            Order created!
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            Send your MXN to the CLABE below via SPEI. Once received, CETES
            will be deposited into your wallet automatically.
          </p>
        </div>

        {clabe && (
          <div className="rounded-xl bg-gray-800/60 border border-gray-700 divide-y divide-gray-700">
            <Row label="CLABE" value={<span className="font-mono text-xs">{clabe}</span>} />
            {depositAmount != null && (
              <Row label="Amount to send" value={`MXN ${fmt(depositAmount)}`} highlight />
            )}
            {orderId && (
              <Row label="Order ID" value={<span className="font-mono text-xs break-all">{orderId}</span>} />
            )}
          </div>
        )}

        <Button variant="secondary" onClick={handleReset} className="w-full">
          Start New Order
        </Button>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-400">
          {errorMsg}
        </div>
        <Button variant="secondary" onClick={handleReset} className="w-full">
          Try Again
        </Button>
      </div>
    );
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-sm font-medium ${highlight ? "text-blue-300" : "text-gray-200"}`}>
        {value}
      </span>
    </div>
  );
}
