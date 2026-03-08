"use client";

import { useWallet } from "@/lib/wallet-context";
import CreateWallet from "./CreateWallet";
import ConnectWallet from "./ConnectWallet";
import ConnectFreighter from "./ConnectFreighter";
import Dashboard from "./Dashboard";
import Spinner from "./ui/Spinner";

export default function WalletApp() {
  const { contractId, publicKey, isLoading } = useWallet();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (contractId || publicKey) {
    return (
      <div className="min-h-screen py-10 px-4">
        <Dashboard />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo / header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-500/20">
            <svg
              className="h-7 w-7 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-100">Passkey Wallet</h1>
          <p className="text-sm text-gray-400 mt-1">
            Stellar Soroban · Secured by WebAuthn
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <CreateWallet />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-xs text-gray-500">or</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>
          <ConnectWallet />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-xs text-gray-500">or</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>
          <ConnectFreighter />
        </div>
      </div>
    </div>
  );
}
