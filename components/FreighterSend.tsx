"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet-context";
import { signWithFreighter } from "@/lib/freighter";
import { xlmToStroops } from "@/lib/utils";
import Button from "./ui/Button";
import Input from "./ui/Input";

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

type Phase = "idle" | "building" | "signing" | "submitting" | "success" | "error";

export default function FreighterSend() {
  const { publicKey, refreshBalance } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !recipient.trim() || !amount.trim()) return;

    setPhase("building");
    setErrorMsg(null);
    setTxHash(null);

    try {
      // Phase 1: server builds the unsigned classic Payment transaction
      const stroops = xlmToStroops(amount).toString();
      const buildRes = await fetch("/api/freighter/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: publicKey,
          to: recipient.trim(),
          amount: stroops,
        }),
      });

      if (!buildRes.ok) {
        const data = await buildRes.json().catch(() => ({}));
        throw new Error(data.error || `Build failed (${buildRes.status})`);
      }

      const { xdr } = await buildRes.json();

      // Phase 2: Freighter signs the full transaction envelope
      setPhase("signing");
      const signedXdr = await signWithFreighter(xdr, NETWORK_PASSPHRASE, publicKey);

      // Phase 3: submit signed XDR to Horizon
      setPhase("submitting");
      const submitRes = await fetch("/api/freighter/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xdr: signedXdr }),
      });

      if (!submitRes.ok) {
        const data = await submitRes.json().catch(() => ({}));
        throw new Error(data.error || `Submit failed (${submitRes.status})`);
      }

      const { hash } = await submitRes.json();
      setTxHash(hash);
      setPhase("success");
      setRecipient("");
      setAmount("");
      refreshBalance();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setErrorMsg(
        msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("reject")
          ? "Freighter signing was cancelled."
          : msg
      );
      setPhase("error");
    }
  };

  const phaseLabel: Record<Phase, string> = {
    idle: "Send XLM",
    building: "Building transaction…",
    signing: "Check Freighter extension…",
    submitting: "Submitting to Stellar…",
    success: "Send XLM",
    error: "Send XLM",
  };

  const isProcessing = ["building", "signing", "submitting"].includes(phase);

  return (
    <form onSubmit={handleSend} className="flex flex-col gap-4">
      <Input
        label="Recipient address"
        type="text"
        placeholder="G..."
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        required
        disabled={isProcessing}
      />
      <Input
        label="Amount (XLM)"
        type="number"
        placeholder="0.0000000"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        min="0.0000001"
        step="0.0000001"
        required
        disabled={isProcessing}
      />

      {phase === "signing" && (
        <div className="rounded-lg bg-blue-900/30 border border-blue-700 px-3 py-2 text-sm text-blue-300 text-center">
          Check your Freighter extension to approve the transaction…
        </div>
      )}

      {phase === "success" && txHash && (
        <div className="rounded-lg bg-green-900/30 border border-green-700 px-3 py-2">
          <p className="text-sm text-green-400 font-medium">Transaction successful!</p>
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline font-mono break-all mt-1 block"
          >
            {txHash}
          </a>
        </div>
      )}

      {phase === "error" && errorMsg && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-400">
          {errorMsg}
        </div>
      )}

      <Button type="submit" loading={isProcessing} className="w-full">
        {isProcessing ? phaseLabel[phase] : phaseLabel.idle}
      </Button>
    </form>
  );
}
