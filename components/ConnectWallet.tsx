"use client";

import { useWallet } from "@/lib/wallet-context";
import Button from "./ui/Button";

export default function ConnectWallet() {
  const { connectWallet, isLoading, error } = useWallet();

  return (
    <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Connect Existing Wallet</h2>
        <p className="text-sm text-gray-400 mt-1">
          Returning user? Authenticate with your passkey.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <Button
        variant="secondary"
        loading={isLoading}
        onClick={connectWallet}
        className="w-full"
      >
        Connect with Passkey
      </Button>

      <p className="mt-4 text-xs text-gray-500 text-center">
        Your browser will prompt you to authenticate with a saved passkey.
      </p>
    </div>
  );
}
