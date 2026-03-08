import { Server } from "@stellar/stellar-sdk/rpc";

export const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL!;
export const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!;
export const WALLET_WASM_HASH = process.env.NEXT_PUBLIC_WALLET_WASM_HASH!;
export const NATIVE_SAC_CONTRACT_ID =
  process.env.NEXT_PUBLIC_NATIVE_SAC_CONTRACT_ID!;

export const server = new Server(RPC_URL);
