"use client";

import { useState } from "react";
import Button from "./ui/Button";
import Input from "./ui/Input";

type Phase = "idle" | "submitting" | "success" | "error";

export default function TrustlineForm() {
  const [assetCode, setAssetCode] = useState("");
  const [issuer, setIssuer] = useState("");
  const [limit, setLimit] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("submitting");
    setErrorMsg(null);
    setTxHash(null);

    try {
      const res = await fetch("/api/trustline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetCode: assetCode.trim().toUpperCase(),
          issuer: issuer.trim(),
          limit: limit.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);

      setTxHash(data.hash);
      setPhase("success");
      setAssetCode("");
      setIssuer("");
      setLimit("");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setPhase("error");
    }
  };

  const isProcessing = phase === "submitting";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-xs text-gray-400 leading-relaxed">
        Creates a trustline so your wallet can hold a classic Stellar asset
        (e.g. USDC). Leave <span className="font-mono">Limit</span> blank to
        allow the maximum amount.
      </p>

      <Input
        label="Asset code"
        type="text"
        placeholder="USDC"
        value={assetCode}
        onChange={(e) => setAssetCode(e.target.value.toUpperCase())}
        required
        disabled={isProcessing}
        maxLength={12}
      />

      <Input
        label="Issuer address"
        type="text"
        placeholder="G…"
        value={issuer}
        onChange={(e) => setIssuer(e.target.value)}
        required
        disabled={isProcessing}
      />

      <Input
        label="Limit (optional)"
        type="number"
        placeholder="Leave blank for maximum"
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        disabled={isProcessing}
        min="0"
        step="0.0000001"
      />

      {phase === "success" && txHash && (
        <div className="rounded-lg bg-green-900/30 border border-green-700 px-3 py-2">
          <p className="text-sm text-green-400 font-medium">
            Trustline created!
          </p>
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
        {isProcessing ? "Creating trustline…" : "Create Trustline"}
      </Button>
    </form>
  );
}
