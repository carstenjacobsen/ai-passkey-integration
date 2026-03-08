"use client";

import {
  isConnected,
  getAddress,
  signTransaction,
} from "@stellar/freighter-api";

export async function isFreighterInstalled(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const result = await isConnected();
    return result.isConnected;
  } catch {
    return false;
  }
}

export async function connectFreighter(): Promise<string> {
  const result = await getAddress();
  if (result.error) throw new Error(result.error.message ?? "Freighter connection failed");
  if (!result.address) throw new Error("Freighter returned no address");
  return result.address;
}

export async function signWithFreighter(
  xdr: string,
  networkPassphrase: string,
  address: string
): Promise<string> {
  const result = await signTransaction(xdr, { networkPassphrase, address });
  if (result.error) throw new Error(result.error.message ?? "Freighter signing failed");
  if (!result.signedTxXdr) throw new Error("Freighter returned no signed transaction");
  return result.signedTxXdr;
}
