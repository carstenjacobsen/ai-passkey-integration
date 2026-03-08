"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet-context";
import { kit } from "@/lib/passkey";
import { xlmToStroops } from "@/lib/utils";
import Button from "./ui/Button";
import Input from "./ui/Input";

type Phase = "idle" | "building" | "signing" | "submitting" | "success" | "error";

export default function SendXLM() {
  const { contractId, keyId, refreshBalance } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractId || !recipient.trim() || !amount.trim()) return;

    setPhase("building");
    setErrorMsg(null);
    setTxHash(null);

    try {
      // Phase 1: server builds the unsigned transaction (fee-payer as source)
      const stroops = xlmToStroops(amount).toString();
      const buildRes = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: contractId, to: recipient.trim(), amount: stroops }),
      });

      if (!buildRes.ok) {
        const data = await buildRes.json().catch(() => ({}));
        throw new Error(data.error || `Build failed (${buildRes.status})`);
      }

      const { xdr } = await buildRes.json();

      // Phase 2: passkey signs the auth entry (WebAuthn prompt)
      setPhase("signing");
      const signedTxn = await kit.sign(xdr, { keyId: keyId ?? undefined });

      // Phase 3: server signs outer envelope + submits
      setPhase("submitting");
      const sendRes = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xdr: signedTxn.built!.toXDR() }),
      });

      if (!sendRes.ok) {
        const data = await sendRes.json().catch(() => ({}));
        throw new Error(data.error || `Submit failed (${sendRes.status})`);
      }

      const { hash } = await sendRes.json();
      setTxHash(hash);
      setPhase("success");
      setRecipient("");
      setAmount("");
      refreshBalance();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setErrorMsg(msg.includes("NotAllowedError") ? "Passkey prompt was cancelled." : msg);
      setPhase("error");
    }
  };

  const phaseLabel: Record<Phase, string> = {
    idle: "Send XLM",
    building: "Building transaction...",
    signing: "Awaiting passkey signature...",
    submitting: "Submitting to Stellar...",
    success: "Send XLM",
    error: "Send XLM",
  };

  const isProcessing = ["building", "signing", "submitting"].includes(phase);

  return (
    <form onSubmit={handleSend} className="flex flex-col gap-4">
      <Input
        label="Recipient address"
        type="text"
        placeholder="C... or G..."
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
          Check your device for a passkey authentication prompt...
        </div>
      )}

      {phase === "success" && txHash && (
        <div className="rounded-lg bg-green-900/30 border border-green-700 px-3 py-2">
          <p className="text-sm text-green-400 font-medium">Transaction successful!</p>
          <p className="text-xs text-gray-400 mt-1 font-mono break-all">{txHash}</p>
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
