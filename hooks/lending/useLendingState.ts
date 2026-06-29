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

import { useReadContracts } from "wagmi";
import { type Address, formatUnits } from "viem";
import { LENDING_ABI } from "@/lib/contracts/abis/lending";
import { LENDING_ADDRESS, COLLATERAL_DECIMALS, LOAN_DECIMALS } from "@/lib/contracts/addresses";

function fmt(value: bigint, decimals: number, opts: Intl.NumberFormatOptions): string {
  const n = parseFloat(formatUnits(value, decimals));
  return n === 0 ? "0" : n.toLocaleString("en-US", opts);
}

export function useLendingState(userAddress: Address | undefined) {
  const lendingContract = {
    address: LENDING_ADDRESS,
    abi: LENDING_ABI,
  } as const;

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...lendingContract, functionName: "collateralFactor" },
      { ...lendingContract, functionName: "poolLiquidity" },
      ...(userAddress
        ? [
            { ...lendingContract, functionName: "collateralBalances", args: [userAddress] },
            { ...lendingContract, functionName: "loans", args: [userAddress] },
            { ...lendingContract, functionName: "maxBorrow", args: [userAddress] },
            { ...lendingContract, functionName: "availableCollateral", args: [userAddress] },
          ]
        : []),
    ],
    query: {
      enabled: LENDING_ADDRESS !== "0x0000000000000000000000000000000000000000",
      refetchInterval: 15_000,
    },
  });

  const collateralFactor = data?.[0]?.result as bigint | undefined;
  const poolLiquidity = data?.[1]?.result as bigint | undefined;
  const collateralBalance = userAddress ? (data?.[2]?.result as bigint | undefined) : undefined;
  const loan = userAddress
    ? (data?.[3]?.result as
        | readonly [bigint, bigint, boolean]
        | undefined)
    : undefined;
  const maxBorrow = userAddress ? (data?.[4]?.result as bigint | undefined) : undefined;
  const availableCollateral = userAddress ? (data?.[5]?.result as bigint | undefined) : undefined;

  return {
    isLoading,
    refetch,
    // raw bigints
    collateralFactor,
    poolLiquidity,
    collateralBalance,
    loanAmount: loan?.[0],
    loanCollateral: loan?.[1],
    loanIsActive: loan?.[2] ?? false,
    maxBorrow,
    availableCollateral,
    // formatted strings
    poolLiquidityFormatted: poolLiquidity !== undefined
      ? parseFloat(formatUnits(poolLiquidity, LOAN_DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 2 })
      : "—",
    collateralBalanceFormatted: collateralBalance !== undefined
      ? fmt(collateralBalance, COLLATERAL_DECIMALS, { minimumFractionDigits: 6, maximumFractionDigits: 8 })
      : "—",
    loanAmountFormatted: loan?.[0] !== undefined
      ? fmt(loan[0], LOAN_DECIMALS, { minimumFractionDigits: 6, maximumFractionDigits: 6 })
      : "—",
    maxBorrowFormatted: maxBorrow !== undefined
      ? fmt(maxBorrow, LOAN_DECIMALS, { minimumFractionDigits: 6, maximumFractionDigits: 6 })
      : "—",
    availableCollateralFormatted: availableCollateral !== undefined
      ? fmt(availableCollateral, COLLATERAL_DECIMALS, { minimumFractionDigits: 6, maximumFractionDigits: 8 })
      : "—",
  };
}
