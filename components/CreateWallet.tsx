"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet-context";
import Button from "./ui/Button";
import Input from "./ui/Input";

export default function CreateWallet() {
  const { createWallet, isLoading, error } = useWallet();
  const [appName, setAppName] = useState("Stellar Wallet");
  const [userName, setUserName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) return;
    await createWallet(appName.trim() || "Stellar Wallet", userName.trim());
  };

  return (
    <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Create New Wallet</h2>
        <p className="text-sm text-gray-400 mt-1">
          Register a passkey — no seed phrase needed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Your name"
          type="text"
          placeholder="Alice"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          required
          autoComplete="username webauthn"
        />
        <Input
          label="Wallet label (optional)"
          type="text"
          placeholder="Stellar Wallet"
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
        />

        {error && (
          <p className="rounded-lg bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" loading={isLoading} className="w-full mt-1">
          Create Wallet with Passkey
        </Button>
      </form>

      <p className="mt-4 text-xs text-gray-500 text-center">
        Your browser will prompt you to create a passkey (fingerprint, Face ID, or PIN).
      </p>
    </div>
  );
}
