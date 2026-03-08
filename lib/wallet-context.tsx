"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { kit, native } from "./passkey";
import { stroopsToXLM, formatXLM } from "./utils";
import { connectFreighter as freighterConnect } from "./freighter";

const STORAGE_KEY = "stellar_wallet";
const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";

// WebAuthn requires a valid domain name as the rpId — IP addresses are rejected.
// If the browser is on 127.0.0.1, force rpId to 'localhost'.
function getRpId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const hostname = window.location.hostname;
  if (hostname === "127.0.0.1") return "localhost";
  return undefined; // let passkey-kit default to the current hostname
}

type WalletType = "passkey" | "freighter";

interface WalletState {
  walletType: WalletType | null;
  keyId: string | null;
  contractId: string | null;
  publicKey: string | null; // G... address — set for Freighter, null for passkey
  balance: string | null;
  isLoading: boolean;
  error: string | null;
}

interface WalletActions {
  createWallet: (appName: string, userName: string) => Promise<void>;
  connectWallet: () => Promise<void>;
  connectFreighter: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletState & WalletActions | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [keyId, setKeyId] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Attempt to reconnect from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const {
          walletType: wt = "passkey",
          keyId: storedKeyId,
          contractId: storedContractId,
          publicKey: storedPublicKey,
        } = JSON.parse(stored);

        if (wt === "freighter" && storedPublicKey) {
          setWalletType("freighter");
          setPublicKey(storedPublicKey);
        } else if (storedKeyId && storedContractId) {
          setWalletType("passkey");
          setKeyId(storedKeyId);
          setContractId(storedContractId);
          kit
            .connectWallet({ keyId: storedKeyId, rpId: getRpId() })
            .catch(() => {
              // Silent — user will explicitly reconnect via ConnectWallet
            });
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const persistPasskey = useCallback((kid: string, cid: string) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ walletType: "passkey", keyId: kid, contractId: cid })
    );
    setWalletType("passkey");
    setKeyId(kid);
    setContractId(cid);
  }, []);

  const persistFreighter = useCallback((pk: string) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ walletType: "freighter", publicKey: pk })
    );
    setWalletType("freighter");
    setPublicKey(pk);
  }, []);

  const createWallet = useCallback(
    async (appName: string, userName: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const { keyIdBase64, contractId: cid, signedTx } = await kit.createWallet(
          appName,
          userName,
          { rpId: getRpId() }
        );

        // Submit the deployment transaction
        const res = await fetch("/api/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ xdr: signedTx.toXDR() }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Deploy failed (${res.status})`);
        }

        persistPasskey(keyIdBase64, cid);
      } catch (err: unknown) {
        console.error("createWallet error:", err);
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : (JSON.stringify(err) ?? "Wallet creation failed");
        if (msg.includes("NotAllowedError") || msg.includes("cancelled")) {
          setError("Passkey prompt was cancelled. Please try again.");
        } else {
          setError(msg);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [persistPasskey]
  );

  const connectWallet = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { keyIdBase64, contractId: cid } = await kit.connectWallet({
        rpId: getRpId(),
      });
      persistPasskey(keyIdBase64, cid);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [persistPasskey]);

  const connectFreighter = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const pk = await freighterConnect();
      persistFreighter(pk);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Freighter connection failed";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [persistFreighter]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setWalletType(null);
    setKeyId(null);
    setContractId(null);
    setPublicKey(null);
    setBalance(null);
    setError(null);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (walletType === "freighter" && publicKey) {
      try {
        const res = await fetch(`${HORIZON_TESTNET}/accounts/${publicKey}`);
        if (!res.ok) {
          setBalance("0.0");
          return;
        }
        const data = await res.json();
        const xlm =
          (data.balances as Array<{ asset_type: string; balance: string }>)?.find(
            (b) => b.asset_type === "native"
          )?.balance ?? "0.0";
        setBalance(xlm);
      } catch {
        setBalance("0.0");
      }
    } else if (walletType === "passkey" && contractId) {
      try {
        const result = await native.balance({ id: contractId });
        const stroops = result.result as bigint;
        setBalance(formatXLM(stroopsToXLM(stroops)));
      } catch {
        setBalance("0.0");
      }
    }
  }, [walletType, contractId, publicKey]);

  return (
    <WalletContext.Provider
      value={{
        walletType,
        keyId,
        contractId,
        publicKey,
        balance,
        isLoading,
        error,
        createWallet,
        connectWallet,
        connectFreighter,
        disconnect,
        refreshBalance,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
