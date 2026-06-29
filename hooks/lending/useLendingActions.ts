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

import { useEffect, useRef } from "react";
import { parseUnits } from "viem";
import { useContractWrite } from "@/hooks/useContractWrite";
import { ERC20_ABI, TESTNET_ERC20_ABI, LENDING_ABI } from "@/lib/contracts";
import { LENDING_ADDRESS, USDC_ADDRESS, CIRBTC_ADDRESS, COLLATERAL_DECIMALS, LOAN_DECIMALS } from "@/lib/contracts/addresses";
import { useWallet } from "@/contexts/WalletContext";
import { useLogTransaction } from "@/hooks/useTransactions";
import type { TxAction, TxToken } from "@/lib/supabase/transactions";

// cirBTC is obtained from Circle's faucet (https://faucet.circle.com) — not
// mintable by this app. See README § Security & Usage Model.

interface PendingLog {
  action: TxAction;
  token: TxToken;
  amountRaw: bigint;
  amountFormatted: string;
}

function useLogOnConfirm(
  isSuccess: boolean,
  hash: `0x${string}` | undefined,
  pending: { current: PendingLog | null },
) {
  const { address } = useWallet();
  const { mutate } = useLogTransaction();
  const loggedHash = useRef<string | null>(null);

  useEffect(() => {
    if (!isSuccess || !hash || !address || !pending.current) return;
    if (loggedHash.current === hash) return;
    loggedHash.current = hash;
    const p = pending.current;
    mutate({
      tx_hash: hash,
      wallet_address: address,
      action: p.action,
      token: p.token,
      amount: p.amountRaw.toString(),
      amount_formatted: p.amountFormatted,
    });
  }, [isSuccess, hash, address, mutate, pending]);
}

// ─── USDC helpers (loan token) ───────────────────────────────────────────────

export function useMintUsdc() {
  const { write, isPending, isConfirming, isSubmitted, isSuccess, error, hash } = useContractWrite();
  const { address } = useWallet();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(isSuccess, hash, pending);

  const mint = (amount: string) => {
    if (!address) return;
    const raw = parseUnits(amount, LOAN_DECIMALS);
    pending.current = { action: "mint_usdc", token: "USDC", amountRaw: raw, amountFormatted: amount };
    write({
      address: USDC_ADDRESS,
      abi: TESTNET_ERC20_ABI,
      functionName: "allocateTo",
      args: [address, raw],
    });
  };

  return { mint, isPending, isConfirming, isSubmitted, isSuccess, error, hash };
}

export function useApproveCirBtc() {
  const { write, isPending, isConfirming, isSubmitted, isSuccess, error, hash } = useContractWrite();

  const approve = (amount: bigint) => {
    write({
      address: CIRBTC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [LENDING_ADDRESS, amount],
    });
  };

  return { approve, isPending, isConfirming, isSubmitted, isSuccess, error, hash };
}

// ─── USDC helpers (for repaying loans) ───────────────────────────────────────

export function useApproveUsdcForLending() {
  const { write, isPending, isConfirming, isSubmitted, isSuccess, error, hash } = useContractWrite();

  const approve = (amount: bigint) => {
    write({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [LENDING_ADDRESS, amount],
    });
  };

  return { approve, isPending, isConfirming, isSubmitted, isSuccess, error, hash };
}

// ─── Lending contract actions ─────────────────────────────────────────────────

export function useDepositCollateral() {
  const { write, isPending, isConfirming, isSubmitted, isSuccess, error, hash } = useContractWrite();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(isSuccess, hash, pending);

  const deposit = (amount: string) => {
    const raw = parseUnits(amount, COLLATERAL_DECIMALS);
    pending.current = { action: "deposit", token: "cirBTC", amountRaw: raw, amountFormatted: amount };
    write({
      address: LENDING_ADDRESS,
      abi: LENDING_ABI,
      functionName: "depositCollateral",
      args: [raw],
    });
  };

  return { deposit, isPending, isConfirming, isSubmitted, isSuccess, error, hash };
}

export function useWithdrawCollateral() {
  const { write, isPending, isConfirming, isSubmitted, isSuccess, error, hash } = useContractWrite();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(isSuccess, hash, pending);

  const withdraw = (amount: string) => {
    const raw = parseUnits(amount, COLLATERAL_DECIMALS);
    pending.current = { action: "withdraw", token: "cirBTC", amountRaw: raw, amountFormatted: amount };
    write({
      address: LENDING_ADDRESS,
      abi: LENDING_ABI,
      functionName: "withdrawCollateral",
      args: [raw],
    });
  };

  return { withdraw, isPending, isConfirming, isSubmitted, isSuccess, error, hash };
}

export function useTakeLoan() {
  const { write, isPending, isConfirming, isSubmitted, isSuccess, error, hash } = useContractWrite();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(isSuccess, hash, pending);

  const borrow = (amount: string) => {
    const raw = parseUnits(amount, LOAN_DECIMALS);
    pending.current = { action: "borrow", token: "USDC", amountRaw: raw, amountFormatted: amount };
    write({
      address: LENDING_ADDRESS,
      abi: LENDING_ABI,
      functionName: "takeLoan",
      args: [raw],
    });
  };

  return { borrow, isPending, isConfirming, isSubmitted, isSuccess, error, hash };
}

export function useRepayLoan() {
  const { write, isPending, isConfirming, isSubmitted, isSuccess, error, hash } = useContractWrite();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(isSuccess, hash, pending);

  const repay = (amount: string) => {
    const raw = parseUnits(amount, LOAN_DECIMALS);
    pending.current = { action: "repay", token: "USDC", amountRaw: raw, amountFormatted: amount };
    write({
      address: LENDING_ADDRESS,
      abi: LENDING_ABI,
      functionName: "repayLoan",
      args: [raw],
    });
  };

  return { repay, isPending, isConfirming, isSubmitted, isSuccess, error, hash };
}
