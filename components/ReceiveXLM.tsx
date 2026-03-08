"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useWallet } from "@/lib/wallet-context";
import Button from "./ui/Button";

export default function ReceiveXLM() {
  const { walletType, contractId, publicKey } = useWallet();
  const address = contractId ?? publicKey;
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!address) return null;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="rounded-2xl bg-white p-4 shadow-lg">
        <QRCodeSVG
          value={address}
          size={180}
          bgColor="#ffffff"
          fgColor="#030712"
          level="M"
        />
      </div>

      <div className="w-full rounded-xl bg-gray-800 border border-gray-700 p-3">
        <p className="text-xs text-gray-400 mb-1 font-medium">Wallet address</p>
        <p className="font-mono text-xs text-gray-200 break-all leading-relaxed">
          {address}
        </p>
      </div>

      <Button variant="secondary" onClick={copyAddress} className="w-full">
        {copied ? "Copied!" : "Copy Address"}
      </Button>

      {walletType === "passkey" && (
        <div className="rounded-lg bg-yellow-900/20 border border-yellow-800/50 px-3 py-2">
          <p className="text-xs text-yellow-500 text-center">
            This is a Soroban contract address (C...). Most centralized exchanges
            cannot send to contract addresses — only use with Soroban-aware wallets.
          </p>
        </div>
      )}
    </div>
  );
}
