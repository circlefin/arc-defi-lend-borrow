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

import { useState, useCallback, useRef } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { type Abi, type Address, type Hex, encodeFunctionData } from "viem";
import { useWallet } from "@/contexts/WalletContext";
import { WAGMI_POLLING_INTERVAL } from "@/lib/wagmi";

interface ContractWriteParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export function useContractWrite() {
  const { walletType, bundlerClient, ensureCircleSigner } = useWallet();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // Incremented on every new write() call so stale background polls self-cancel.
  const callIdRef = useRef(0);

  const [hash, setHash] = useState<Hex | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const write = useCallback(
    async (params: ContractWriteParams) => {
      const callId = ++callIdRef.current;

      setIsPending(true);
      setIsConfirming(false);
      setIsSubmitted(false);
      setIsSuccess(false);
      setError(null);
      setHash(undefined);

      if (walletType === "circle") {
        // The session may be rehydrated from cache (address known, signer not
        // built yet). Mint the passkey signer on demand — this runs inside the
        // user's action click, so the WebAuthn gesture requirement is satisfied.
        const client = bundlerClient ?? (await ensureCircleSigner());
        if (callIdRef.current !== callId) return;
        if (!client) {
          // User cancelled the passkey prompt — abort silently, no error.
          setIsPending(false);
          return;
        }

        const data = encodeFunctionData({
          abi: params.abi,
          functionName: params.functionName,
          args: params.args as unknown[],
        });

        let userOpHash: Hex;
        try {
          userOpHash = await client.sendUserOperation({
            calls: [{ to: params.address as Hex, data }],
            paymaster: true,
          });
        } catch (err) {
          if (callIdRef.current !== callId) return;
          setIsPending(false);
          setError(err instanceof Error ? err : new Error("Transaction failed"));
          return;
        }

        if (callIdRef.current !== callId) return;
        setIsPending(false);
        setIsConfirming(true);

        // Poll in the background. The Arc testnet bundler can take several
        // minutes to include a UserOp, so we loop with short per-attempt
        // timeouts rather than waiting on a single long one. On timeout we
        // flip to isSubmitted ("slow network") instead of surfacing an error.
        const pollForReceipt = async () => {
          while (callIdRef.current === callId) {
            try {
              const { receipt } = await client.waitForUserOperationReceipt({
                hash: userOpHash,
                timeout: 60_000,
              });
              if (callIdRef.current !== callId) return;
              setHash(receipt.transactionHash);
              setIsConfirming(false);
              setIsSubmitted(false);
              setIsSuccess(true);
              return;
            } catch (err) {
              if (callIdRef.current !== callId) return;
              if (
                err instanceof Error &&
                err.message.includes("Timed out while waiting for User Operation")
              ) {
                setIsConfirming(false);
                setIsSubmitted(true);
                // loop and retry
              } else {
                setIsConfirming(false);
                setIsSubmitted(false);
                setError(err instanceof Error ? err : new Error("Transaction failed"));
                return;
              }
            }
          }
        };

        pollForReceipt();
      } else {
        try {
          if (!publicClient) {
            throw new Error("No public client available");
          }

          const txHash = await writeContractAsync({
            address: params.address,
            abi: params.abi,
            functionName: params.functionName,
            args: params.args as unknown[],
          });

          setHash(txHash);
          setIsPending(false);
          setIsConfirming(true);

          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            pollingInterval: WAGMI_POLLING_INTERVAL,
          });

          setHash(receipt.transactionHash);
          setIsConfirming(false);
          setIsSuccess(true);
        } catch (err) {
          setIsPending(false);
          setIsConfirming(false);
          setError(err instanceof Error ? err : new Error("Transaction failed"));
        }
      }
    },
    [walletType, bundlerClient, ensureCircleSigner, publicClient, writeContractAsync],
  );

  return {
    write,
    isPending,
    isConfirming,
    isSubmitted,
    isSuccess,
    error,
    hash,
  };
}
