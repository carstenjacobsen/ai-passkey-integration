"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWallet } from "@/lib/wallet-context";
import { kit } from "@/lib/passkey";
import Button from "./ui/Button";
import Input from "./ui/Input";
import Spinner from "./ui/Spinner";

type Phase =
  | "idle"
  | "quoting"
  | "quoted"
  | "ordering"
  | "awaiting_tx"    // polling Etherfuse for burnTransaction
  | "signing"        // passkey prompt
  | "submitting"     // sending signed tx to Stellar
  | "success"
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

export default function OffRamp() {
  const { contractId, keyId, refreshBalance } = useWallet();
  const [cetesAmount, setCetesAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  // Countdown for quote expiry
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

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const handleGetQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("quoting");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/etherfuse/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "offramp", sourceAmount: cetesAmount }),
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
      const oid = data.orderId ?? data.offramp?.orderId;
      if (!oid) throw new Error("No orderId in response");
      setOrderId(oid);
      setPhase("awaiting_tx");
      stoppedRef.current = false;
      schedulePoll(oid);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Order failed");
      setPhase("error");
    }
  };

  // Poll until burnTransaction is ready, then sign + submit
  const schedulePoll = useCallback((oid: string) => {
    pollRef.current = setTimeout(() => pollOnce(oid), 3000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pollOnce = useCallback(
    async (oid: string) => {
      if (stoppedRef.current) return;
      try {
        const res = await fetch(`/api/etherfuse/order/${oid}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error ?? "Poll failed");

        const terminal = ["failed", "canceled", "refunded"];
        if (terminal.includes(data.status)) {
          setErrorMsg(`Order ${data.status}`);
          setPhase("error");
          return;
        }

        if (data.burnTransaction) {
          await signAndSubmit(data.burnTransaction);
          return;
        }

        // Not ready yet — keep polling
        schedulePoll(oid);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Polling error");
        setPhase("error");
      }
    },
    [schedulePoll] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const signAndSubmit = async (burnXdr: string) => {
    try {
      // Phase 1: passkey signs the Soroban auth entries in the burnTransaction
      setPhase("signing");
      const signedTxn = await kit.sign(burnXdr, {
        keyId: keyId ?? undefined,
      });

      // Phase 2: send signed XDR to our relay (adds fee-payer sig + submits)
      setPhase("submitting");
      const sendRes = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xdr: signedTxn.built!.toXDR() }),
      });

      const sendData = await sendRes.json();
      if (!sendRes.ok)
        throw new Error(sendData.error || `Submit failed (${sendRes.status})`);

      setTxHash(sendData.hash);
      setPhase("success");
      refreshBalance();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Signing failed";
      setErrorMsg(
        msg.includes("NotAllowedError") || msg.includes("cancelled")
          ? "Passkey prompt was cancelled."
          : msg
      );
      setPhase("error");
    }
  };

  const handleReset = () => {
    stoppedRef.current = true;
    if (pollRef.current) clearTimeout(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase("idle");
    setQuote(null);
    setOrderId(null);
    setTxHash(null);
    setErrorMsg(null);
    setCetesAmount("");
  };

  const fmt = (n: string | number, decimals = 7) =>
    Number(n).toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    });

  // ── Idle / Quoting ────────────────────────────────────────────────────────
  if (phase === "idle" || phase === "quoting") {
    return (
      <form onSubmit={handleGetQuote} className="flex flex-col gap-4">
        <p className="text-xs text-gray-400 leading-relaxed">
          Sell CETES for MXN. Enter the amount of CETES to redeem and we&apos;ll
          show you a quote. MXN will be deposited to your linked bank account.
        </p>
        <Input
          label="Amount (CETES)"
          type="number"
          placeholder="100"
          value={cetesAmount}
          onChange={(e) => setCetesAmount(e.target.value)}
          min="0.0000001"
          step="0.0000001"
          required
          disabled={phase === "quoting"}
        />
        <Button type="submit" loading={phase === "quoting"} className="w-full">
          {phase === "quoting" ? "Getting quote…" : "Get Quote"}
        </Button>
      </form>
    );
  }

  // ── Quoted ────────────────────────────────────────────────────────────────
  if (phase === "quoted" && quote) {
    const expired = secondsLeft === 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-gray-800/60 border border-gray-700 divide-y divide-gray-700">
          <Row label="You sell" value={`${fmt(quote.sourceAmount)} CETES`} />
          <Row
            label="You receive"
            value={`MXN ${fmt(quote.destinationAmountAfterFee, 2)}`}
            highlight
          />
          <Row label="Exchange rate" value={`1 CETES = MXN ${fmt(quote.exchangeRate, 2)}`} />
          <Row
            label="Fee"
            value={`MXN ${fmt(quote.feeAmount, 2)} (${quote.feeBps} bps)`}
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
          <Button variant="secondary" onClick={handleReset} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={expired} className="flex-1">
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

  // ── Awaiting burn transaction ──────────────────────────────────────────────
  if (phase === "awaiting_tx") {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <Spinner />
        <p className="text-sm text-gray-400">Waiting for Etherfuse…</p>
        <p className="text-xs text-gray-500">
          Preparing your redemption transaction
        </p>
        {orderId && (
          <p className="text-xs text-gray-600 font-mono break-all max-w-full">
            {orderId}
          </p>
        )}
      </div>
    );
  }

  // ── Signing ───────────────────────────────────────────────────────────────
  if (phase === "signing") {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="rounded-lg bg-blue-900/30 border border-blue-700 px-3 py-2 text-sm text-blue-300 text-center w-full">
          Check your device for a passkey authentication prompt…
        </div>
      </div>
    );
  }

  // ── Submitting ────────────────────────────────────────────────────────────
  if (phase === "submitting") {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <Spinner />
        <p className="text-sm text-gray-400">Submitting to Stellar…</p>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (phase === "success") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-green-900/20 border border-green-700 p-4">
          <p className="text-sm font-semibold text-green-400 mb-1">
            Redemption submitted!
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            Your CETES have been sent to Etherfuse. MXN will be deposited to
            your linked bank account shortly.
          </p>
          {txHash && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline font-mono break-all mt-2 block"
            >
              {txHash}
            </a>
          )}
        </div>
        <Button variant="secondary" onClick={handleReset} className="w-full">
          New Off-Ramp
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
      <span
        className={`text-sm font-medium ${highlight ? "text-blue-300" : "text-gray-200"}`}
      >
        {value}
      </span>
    </div>
  );
}
