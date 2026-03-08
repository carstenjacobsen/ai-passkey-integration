// This module is CLIENT-SIDE ONLY.
// Do NOT import from Server Components or API routes — it uses browser WebAuthn APIs.
import { PasskeyKit, SACClient } from "passkey-kit";
import {
  RPC_URL,
  NETWORK_PASSPHRASE,
  WALLET_WASM_HASH,
  NATIVE_SAC_CONTRACT_ID,
} from "./stellar";

export const kit = new PasskeyKit({
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
  walletWasmHash: WALLET_WASM_HASH,
});

const sacClient = new SACClient({
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
});

export const native = sacClient.getSACClient(NATIVE_SAC_CONTRACT_ID);
