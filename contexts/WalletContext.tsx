/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { type Address, type Hex, encodeFunctionData, parseGwei } from "viem";
import {
  useConnection,
  useConnect,
  useConnectors,
  useDisconnect,
} from "wagmi";
import {
  toWebAuthnCredential,
  toCircleSmartAccount,
  WebAuthnMode,
} from "@circle-fin/modular-wallets-core";
import { toWebAuthnAccount } from "viem/account-abstraction";
import { createBundlerClient } from "viem/account-abstraction";
import { getPasskeyTransport, getModularTransport, getCirclePublicClient, isCircleConfigured } from "@/lib/circle";
import { arcTestnet } from "@/lib/wagmi";

const STORAGE_KEY = "circle-wallet-credential";

interface StoredCredential {
  credentialId: string;
  // Present while the wallet is "active" (connected). The cached smart-account
  // address lets us rehydrate the connected UI on reload WITHOUT calling
  // toWebAuthnCredential — so no passkey prompt fires on load or tab change.
  // Cleared on explicit disconnect so we don't auto-rehydrate after the user
  // chose to disconnect. The credentialId stays as a login hint either way.
  address?: Address;
}

export type WalletType = "metamask" | "circle" | null;

interface CircleBundlerClient {
  sendUserOperation: (args: {
    calls: { to: Hex; data: Hex; value?: bigint }[];
    paymaster: true;
  }) => Promise<Hex>;
  waitForUserOperationReceipt: (args: { hash: Hex; timeout?: number }) => Promise<{ receipt: { transactionHash: Hex } }>;
}

interface WalletContextValue {
  address: Address | undefined;
  isConnected: boolean;
  walletType: WalletType;
  bundlerClient: CircleBundlerClient | null;
  connectMetaMask: () => void;
  // Resolves true when connected, false when the user cancelled the passkey
  // prompt or the attempt failed — callers use this to decide whether to close
  // the connect dialog (keep it open on cancel/failure so the user can retry).
  connectCircle: (mode: "login" | "register") => Promise<boolean>;
  // Returns a ready bundler client, minting the passkey signer on demand if the
  // session was rehydrated from cache (address known, signer not yet built).
  // Returns null if the user cancels the passkey prompt.
  ensureCircleSigner: () => Promise<CircleBundlerClient | null>;
  disconnect: () => void;
  isConnecting: boolean;
  circleError: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  // Wagmi (MetaMask) state
  const { address: wagmiAddress, isConnected: wagmiConnected } = useConnection();
  const { mutate: wagmiConnect, isPending: wagmiPending } = useConnect();
  const connectors = useConnectors();
  const { mutate: wagmiDisconnect } = useDisconnect();

  // Circle state
  const [circleAddress, setCircleAddress] = useState<Address | undefined>();
  const [bundlerClient, setBundlerClient] = useState<CircleBundlerClient | null>(null);
  const [circleConnecting, setCircleConnecting] = useState(false);
  const [circleError, setCircleError] = useState<string | null>(null);

  // Determine active wallet
  const walletType: WalletType = wagmiConnected
    ? "metamask"
    : circleAddress
      ? "circle"
      : null;

  const address = walletType === "metamask" ? wagmiAddress : circleAddress;
  const isConnected = walletType !== null;

  const initCircleAccount = useCallback(
    async (credential: Awaited<ReturnType<typeof toWebAuthnCredential>>) => {
      const owner = toWebAuthnAccount({ credential });

      const smartAccount = await toCircleSmartAccount({
        client: getCirclePublicClient(),
        owner,
      });

      const client = createBundlerClient({
        account: smartAccount,
        chain: arcTestnet,
        transport: getModularTransport(),
        paymaster: true,
        userOperation: {
          estimateFeesPerGas: async () => ({
            maxFeePerGas: parseGwei("50"),
            maxPriorityFeePerGas: parseGwei("2"),
          }),
        },
      });

      const typedClient = client as unknown as CircleBundlerClient;
      setCircleAddress(smartAccount.address);
      setBundlerClient(typedClient);
      return { client: typedClient, address: smartAccount.address };
    },
    [],
  );

  const connectCircle = useCallback(async (mode: "login" | "register"): Promise<boolean> => {
    setCircleConnecting(true);
    setCircleError(null);
    try {
      if (!isCircleConfigured()) {
        throw new Error(
          "Circle wallet is not configured. Set NEXT_PUBLIC_CIRCLE_CLIENT_KEY and NEXT_PUBLIC_CIRCLE_CLIENT_URL in .env.local.",
        );
      }
      // Disconnect MetaMask if connected
      if (wagmiConnected) wagmiDisconnect();

      let credential: Awaited<ReturnType<typeof toWebAuthnCredential>>;

      if (mode === "login") {
        // Use stored credentialId as a hint so the OS passkey picker targets
        // the right credential. Falls back gracefully if none is stored yet.
        const storedRaw = localStorage.getItem(STORAGE_KEY);
        const storedCredentialId = storedRaw
          ? (JSON.parse(storedRaw) as StoredCredential).credentialId
          : undefined;
        credential = await toWebAuthnCredential({
          transport: getPasskeyTransport(),
          mode: WebAuthnMode.Login,
          ...(storedCredentialId ? { credentialId: storedCredentialId } : {}),
        });
      } else {
        // Not `crypto.randomUUID()`: that API is restricted to secure contexts,
        // so it's undefined when the dev server is reached over plain http on a
        // LAN address (e.g. a phone hitting http://<host-ip>:3000). `getRandomValues`
        // is available in insecure contexts too, so it works in every setup.
        const bytes = crypto.getRandomValues(new Uint8Array(4));
        const username = `user_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
        credential = await toWebAuthnCredential({
          transport: getPasskeyTransport(),
          mode: WebAuthnMode.Register,
          username,
        });
      }

      const { address: smartAddress } = await initCircleAccount(credential);

      const stored: StoredCredential = {
        credentialId: credential.id,
        address: smartAddress,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      return true;
    } catch (err) {
      // NotAllowedError = user dismissed or timed out the passkey prompt — treat
      // it as a cancellation rather than a failure, so no error is surfaced.
      if (err instanceof Error && err.name === "NotAllowedError") return false;
      console.error("Circle wallet connection failed:", err);
      setCircleError(
        err instanceof Error ? err.message : "Failed to connect passkey wallet",
      );
      return false;
    } finally {
      setCircleConnecting(false);
    }
  }, [wagmiConnected, wagmiDisconnect, initCircleAccount]);

  const ensureCircleSigner = useCallback(async (): Promise<CircleBundlerClient | null> => {
    if (bundlerClient) return bundlerClient;
    setCircleConnecting(true);
    setCircleError(null);
    try {
      const storedRaw = localStorage.getItem(STORAGE_KEY);
      const storedCredentialId = storedRaw
        ? (JSON.parse(storedRaw) as StoredCredential).credentialId
        : undefined;
      const credential = await toWebAuthnCredential({
        transport: getPasskeyTransport(),
        mode: WebAuthnMode.Login,
        ...(storedCredentialId ? { credentialId: storedCredentialId } : {}),
      });
      const { client, address: smartAddress } = await initCircleAccount(credential);
      // Re-store in case the user unlocked with a different passkey than cached.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ credentialId: credential.id, address: smartAddress }),
      );
      return client;
    } catch (err) {
      // NotAllowedError = user dismissed/timed out the prompt — treat as cancel.
      if (err instanceof Error && err.name === "NotAllowedError") return null;
      console.error("Failed to unlock passkey wallet:", err);
      setCircleError(
        err instanceof Error ? err.message : "Failed to unlock passkey wallet",
      );
      return null;
    } finally {
      setCircleConnecting(false);
    }
  }, [bundlerClient, initCircleAccount]);

  // Rehydrate the connected Circle UI from the cached address on mount. This is
  // display-only: no toWebAuthnCredential call, so no passkey prompt on load or
  // tab change. The signer is minted lazily by ensureCircleSigner on first use.
  useEffect(() => {
    if (!isCircleConfigured() || wagmiConnected) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as StoredCredential;
    if (stored.address) setCircleAddress((prev) => prev ?? stored.address);
  }, [wagmiConnected]);

  const connectMetaMask = useCallback(() => {
    // Clear Circle state if active
    if (circleAddress) {
      setCircleAddress(undefined);
      setBundlerClient(null);
      localStorage.removeItem(STORAGE_KEY);
    }
    wagmiConnect({ connector: connectors[0] });
  }, [circleAddress, wagmiConnect, connectors]);

  const disconnect = useCallback(() => {
    if (walletType === "metamask") {
      wagmiDisconnect();
    } else if (walletType === "circle") {
      setCircleAddress(undefined);
      setBundlerClient(null);
      // Drop the cached address so we don't auto-rehydrate after an explicit
      // disconnect, but keep the credentialId as a login hint for the OS picker.
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as StoredCredential;
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ credentialId: stored.credentialId }),
        );
      }
    }
  }, [walletType, wagmiDisconnect]);


  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected,
        walletType,
        bundlerClient,
        connectMetaMask,
        connectCircle,
        ensureCircleSigner,
        disconnect,
        isConnecting: wagmiPending || circleConnecting,
        circleError,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

// Helper: encode a contract call as a UserOperation call object
export function encodeContractCall(params: {
  address: Address;
  abi: readonly Record<string, unknown>[];
  functionName: string;
  args?: readonly unknown[];
}): { to: Hex; data: Hex; value?: bigint } {
  return {
    to: params.address as Hex,
    data: encodeFunctionData({
      abi: params.abi,
      functionName: params.functionName,
      args: params.args as unknown[],
    }),
  };
}
