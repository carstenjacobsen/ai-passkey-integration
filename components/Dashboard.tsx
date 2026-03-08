"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet-context";
import { truncateAddress } from "@/lib/utils";
import SendXLM from "./SendXLM";
import FreighterSend from "./FreighterSend";
import ReceiveXLM from "./ReceiveXLM";
import TrustlineForm from "./TrustlineForm";
import OnRamp from "./OnRamp";
import OffRamp from "./OffRamp";
import Button from "./ui/Button";
import Spinner from "./ui/Spinner";

type Tab = "send" | "receive" | "assets" | "ramp";

export default function Dashboard() {
  const { walletType, contractId, publicKey, balance, refreshBalance, disconnect } = useWallet();
  const walletAddress = contractId ?? publicKey;
  const tabs: Tab[] = walletType === "freighter" ? ["send", "receive"] : ["send", "receive", "assets", "ramp"];
  const [tab, setTab] = useState<Tab>("send");
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoadingBalance(true);
    refreshBalance().finally(() => setLoadingBalance(false));
  }, [refreshBalance]);

  const copyAddress = async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-4">
      {/* Header */}
      <div className="rounded-2xl bg-gray-900 border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-gray-400">
            Stellar Testnet · {walletType === "freighter" ? "Freighter" : "Passkey"}
          </span>
          </div>
          <Button variant="danger" onClick={disconnect} className="text-xs px-3 py-1.5">
            Disconnect
          </Button>
        </div>

        {/* Balance */}
        <div className="text-center mb-4">
          <p className="text-xs text-gray-400 mb-1 uppercase tracking-widest">Balance</p>
          {loadingBalance ? (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          ) : (
            <p className="text-4xl font-bold text-gray-100">
              {balance ?? "0.0"}{" "}
              <span className="text-xl text-gray-400">XLM</span>
            </p>
          )}
        </div>

        {/* Address */}
        <button
          onClick={copyAddress}
          className="w-full rounded-lg bg-gray-800/70 border border-gray-700 px-3 py-2 text-center hover:bg-gray-800 transition-colors"
          title={walletAddress ?? ""}
        >
          <p className="text-xs text-gray-400 mb-0.5">Wallet address</p>
          <p className="font-mono text-xs text-gray-300">
            {walletAddress ? truncateAddress(walletAddress, 8) : "—"}
          </p>
          {copied && <p className="text-xs text-blue-400 mt-0.5">Copied!</p>}
        </button>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="flex border-b border-gray-800">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-xs font-medium transition-colors capitalize ${
                tab === t
                  ? "text-blue-400 border-b-2 border-blue-500 bg-blue-500/5"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === "send" ? (
            walletType === "freighter" ? <FreighterSend /> : <SendXLM />
          ) : tab === "receive" ? (
            <ReceiveXLM />
          ) : tab === "assets" ? (
            <TrustlineForm />
          ) : (
            <RampPanel />
          )}
        </div>
      </div>
    </div>
  );
}

// Inner toggle between On-ramp and Off-ramp
function RampPanel() {
  const [mode, setMode] = useState<"onramp" | "offramp">("onramp");
  return (
    <div className="flex flex-col gap-4">
      {/* Segmented control */}
      <div className="flex rounded-xl bg-gray-800/60 border border-gray-700 p-0.5">
        {(["onramp", "offramp"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              mode === m
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {m === "onramp" ? "On-Ramp (MXN → CETES)" : "Off-Ramp (CETES → MXN)"}
          </button>
        ))}
      </div>
      {mode === "onramp" ? <OnRamp /> : <OffRamp />}
    </div>
  );
}
