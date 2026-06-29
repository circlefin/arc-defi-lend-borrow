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

import { useEffect, useSyncExternalStore } from "react";
import { useChainId, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { arcTestnet, LIVE_STATE_REFETCH_INTERVAL } from "@/lib/wagmi";
import { useWallet } from "@/contexts/WalletContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CIRBTC_ADDRESS, USDC_ADDRESS, ERC20_ABI, COLLATERAL_DECIMALS, LOAN_DECIMALS } from "@/lib/contracts";
import { useMintUsdc } from "@/hooks/lending";
import { CopyableText } from "./CopyableText";
import { ConnectDialog } from "./ConnectDialog";

// Circle modular (passkey) wallets can't use the in-app allocateTo faucet — the
// mint is a gas-sponsored userOp and self-minting the mock loan token isn't the
// supported path. Send those users to Circle's faucet instead.
const CIRCLE_FAUCET_URL = "https://faucet.circle.com/";

// Format a token balance for display: trims trailing zeros (no "50000.000000")
// and groups thousands. maxFractionDigits is per-token — cirBTC keeps full
// 8-decimal precision so small but real balances never render as "0".
function fmtBalance(value: bigint, decimals: number, maxFractionDigits: number): string {
  if (value === 0n) return "0";
  return parseFloat(formatUnits(value, decimals)).toLocaleString("en-US", {
    maximumFractionDigits: maxFractionDigits,
  });
}

export function ConnectWallet() {
  const { address, isConnected, walletType, disconnect } = useWallet();
  const chainId = useChainId();
  const mounted = useSyncExternalStore(() => () => { }, () => true, () => false);
  const queryClient = useQueryClient();

  const { data: cirBtcBalance, isLoading: isCirBtcBalanceLoading } = useReadContract({
    address: CIRBTC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && CIRBTC_ADDRESS !== "0x0000000000000000000000000000000000000000",
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  const { data: usdcBalance, isLoading: isUsdcBalanceLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && USDC_ADDRESS !== "0x0000000000000000000000000000000000000000",
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  const mintUsdc = useMintUsdc();

  useEffect(() => {
    if (mintUsdc.isSuccess) queryClient.invalidateQueries();
  }, [mintUsdc.isSuccess, queryClient]);

  if (!mounted) return null;

  if (!isConnected) {
    return <ConnectDialog />;
  }

  const isWrongChain = walletType === "metamask" && chainId !== arcTestnet.id;
  const formattedCirBtcBalance = cirBtcBalance !== undefined
    ? fmtBalance(cirBtcBalance as bigint, COLLATERAL_DECIMALS, 8)
    : null;
  const formattedUsdcBalance = usdcBalance !== undefined
    ? fmtBalance(usdcBalance as bigint, LOAN_DECIMALS, 2)
    : null;

  const walletLabel = walletType === "circle" ? "Passkey" : "MetaMask";

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-3 text-sm sm:justify-end">
      <span className="inline-flex items-center">
        <span className="text-muted-foreground mr-1">cirBTC:</span>
        {isCirBtcBalanceLoading ? (
          <Skeleton className="inline-block h-4 w-20 align-middle" />
        ) : formattedCirBtcBalance !== null ? (
          <span className="font-medium">{formattedCirBtcBalance}</span>
        ) : null}
      </span>
      <span className="text-muted-foreground/40 hidden sm:inline">|</span>
      <span className="inline-flex items-center">
        <span className="text-muted-foreground mr-1">USDC:</span>
        {isUsdcBalanceLoading ? (
          <Skeleton className="inline-block h-4 w-20 align-middle" />
        ) : formattedUsdcBalance !== null ? (
          <span className="font-medium">{formattedUsdcBalance}</span>
        ) : null}
        {walletType === "circle" ? (
          <a
            href={CIRCLE_FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded px-2 py-0.5 ml-1 text-xs font-medium transition-colors bg-green-600/15 text-green-500 hover:bg-green-600/25"
            title="Get USDC from Circle's faucet (opens in a new tab)"
          >
            Faucet ↗
          </a>
        ) : (
          <button
            onClick={() => mintUsdc.mint("1000")}
            disabled={mintUsdc.isPending || mintUsdc.isConfirming}
            className={`rounded px-2 py-0.5 ml-1 text-xs font-medium transition-colors disabled:opacity-50 ${mintUsdc.error
              ? "bg-red-600/15 text-red-500 hover:bg-red-600/25"
              : "bg-green-600/15 text-green-500 hover:bg-green-600/25"
              }`}
            title={mintUsdc.error ? `Error: ${mintUsdc.error.message}` : "Mint 1000 USDC test tokens"}
          >
            {mintUsdc.isPending || mintUsdc.isConfirming
              ? "Minting..."
              : mintUsdc.error
                ? "Mint failed"
                : mintUsdc.isSuccess
                  ? "Minted!"
                  : "Faucet"}
          </button>
        )}
      </span>
      <span className="text-muted-foreground/40 hidden sm:inline">|</span>
      <span>
        <CopyableText value={address!}>
          <code className="text-sm">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </code>
        </CopyableText>
        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {walletLabel}
        </span>
      </span>
      {isWrongChain && (
        <>
          <span className="text-muted-foreground/40 hidden sm:inline">|</span>
          <span className="text-destructive font-medium">Wrong Network</span>
        </>
      )}
      <Button variant="outline" size="sm" onClick={disconnect}>
        Disconnect
      </Button>
    </div>
  );
}
