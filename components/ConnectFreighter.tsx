"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet-context";
import Button from "./ui/Button";

export default function ConnectFreighter() {
  const { connectFreighter, error } = useWallet();
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setLocalError(null);
    try {
      await connectFreighter();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const displayError = localError ?? (error?.includes("Freighter") ? error : null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        onClick={handleConnect}
        loading={loading}
        className="w-full"
      >
        {loading ? "Connecting…" : "Connect with Freighter"}
      </Button>
      {displayError && (
        <p className="text-xs text-red-400 text-center">{displayError}</p>
      )}
    </div>
  );
}
