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

import { useEffect, useState, useSyncExternalStore } from "react";
import { useReadContracts } from "wagmi";
import { parseUnits, formatUnits, type Address } from "viem";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { TxStatus } from "@/components/trading/TxStatus";
import { TransactionHistory } from "@/components/transactions/TransactionHistory";
import { useWallet } from "@/contexts/WalletContext";
import { useLendingState } from "@/hooks/lending/useLendingState";
import {
  useApproveCirBtc,
  useApproveUsdcForLending,
  useDepositCollateral,
  useWithdrawCollateral,
  useTakeLoan,
  useRepayLoan,
} from "@/hooks/lending/useLendingActions";
import { ERC20_ABI } from "@/lib/contracts/abis/erc20";
import {
  LENDING_ADDRESS,
  USDC_ADDRESS,
  CIRBTC_ADDRESS,
  COLLATERAL_DECIMALS,
  LOAN_DECIMALS,
} from "@/lib/contracts/addresses";

// ─── Token balances + allowances ─────────────────────────────────────────────

function useLendingBalances(userAddress: Address | undefined) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { address: CIRBTC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: userAddress ? [userAddress] : undefined },
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: userAddress ? [userAddress] : undefined },
      { address: CIRBTC_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: userAddress ? [userAddress, LENDING_ADDRESS] : undefined },
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: userAddress ? [userAddress, LENDING_ADDRESS] : undefined },
    ],
    query: {
      enabled: !!userAddress && LENDING_ADDRESS !== "0x0000000000000000000000000000000000000000",
      refetchInterval: 15_000,
    },
  });

  return {
    cirBtcBalance: data?.[0]?.result as bigint | undefined,
    usdcBalance: data?.[1]?.result as bigint | undefined,
    cirBtcAllowance: data?.[2]?.result as bigint | undefined,
    usdcAllowance: data?.[3]?.result as bigint | undefined,
    isLoading,
    refetch,
  };
}

// ─── Quick-amount picker ──────────────────────────────────────────────────────

function QuickAmounts({ onSelect, max, presets, onMax }: { onSelect: (v: string) => void; max: number | undefined; presets?: string[]; onMax?: () => void }) {
  const allPresets = presets ?? ["0.0001", "0.0002", "0.0005", "0.001"];
  const values = onMax ? allPresets.slice(0, -1) : allPresets;
  return (
    <div className="flex gap-1 mt-2">
      {values.map((v) => {
        const disabled = max === undefined || parseFloat(v) > max;
        return (
          <button
            key={v}
            onClick={() => onSelect(v)}
            disabled={disabled}
            className="flex-1 rounded bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-secondary"
          >
            {v}
          </button>
        );
      })}
      {onMax && (
        <button
          onClick={onMax}
          disabled={max === undefined || max <= 0}
          className="flex-1 rounded bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-secondary"
        >
          Max
        </button>
      )}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

// Compact a token amount for stat-card headlines (e.g. "499.95T USDC", "50K USDC").
// Falls back to the original string if it doesn't look like a number we can parse.
function compactTokenAmount(value: string): string {
  const [numPart, ...rest] = value.split(" ");
  const n = parseFloat(numPart.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 1000) return value;
  const compact = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
  return rest.length ? `${compact} ${rest.join(" ")}` : compact;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const display = compactTokenAmount(value);
  const truncated = display !== value;
  return (
    <div className="rounded-lg border border-border bg-card p-4 min-w-0">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p
        className="text-lg font-semibold font-mono truncate"
        title={truncated ? value : undefined}
      >
        {display}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

// ─── Collateral panel ─────────────────────────────────────────────────────────

function CollateralPanel({
  cirBtcAllowance,
  cirBtcBalance,
  availableCollateral,
  collateralFactor,
  onSuccess,
}: {
  cirBtcAllowance: bigint | undefined;
  cirBtcBalance: bigint | undefined;
  availableCollateral: bigint | undefined;
  collateralFactor: bigint | undefined;
  onSuccess: () => void;
}) {
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const approveCirBtc = useApproveCirBtc();
  const depositCollateral = useDepositCollateral();
  const withdrawCollateral = useWithdrawCollateral();

  useEffect(() => { if (depositCollateral.isSuccess) { setDepositAmount(""); onSuccess(); } }, [depositCollateral.isSuccess, onSuccess]);
  useEffect(() => { if (withdrawCollateral.isSuccess) { setWithdrawAmount(""); onSuccess(); } }, [withdrawCollateral.isSuccess, onSuccess]);
  useEffect(() => { if (approveCirBtc.isSuccess) onSuccess(); }, [approveCirBtc.isSuccess, onSuccess]);

  const depositBigInt = depositAmount ? parseUnits(depositAmount, COLLATERAL_DECIMALS) : 0n;
  const allowanceInsufficient =
    cirBtcAllowance !== undefined &&
    (cirBtcAllowance === 0n || (depositBigInt > 0n && depositBigInt > cirBtcAllowance));
  // Keep the approval button in its loading state until the refetched allowance reflects the approval,
  // otherwise it briefly flips back to "Approve cirBTC" between tx confirmation and allowance refresh.
  const approvePending = approveCirBtc.isPending || approveCirBtc.isConfirming || approveCirBtc.isSubmitted || (approveCirBtc.isSuccess && allowanceInsufficient);
  const needsCirBtcApproval = allowanceInsufficient || approvePending;

  const maxDepositNum = cirBtcBalance !== undefined
    ? parseFloat(formatUnits(cirBtcBalance, COLLATERAL_DECIMALS))
    : undefined;
  const maxWithdrawNum = availableCollateral !== undefined
    ? parseFloat(formatUnits(availableCollateral, COLLATERAL_DECIMALS))
    : undefined;

  function clampToMax(value: string, max: number | undefined): string {
    if (!value || max === undefined) return value;
    const n = parseFloat(value);
    if (Number.isNaN(n)) return value;
    return n > max ? max.toString() : value;
  }

  const availableFmt = availableCollateral !== undefined
    ? (availableCollateral === 0n ? "0" : parseFloat(formatUnits(availableCollateral, COLLATERAL_DECIMALS)).toFixed(6))
    : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Collateral
          <Badge variant="secondary">cirBTC</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {collateralFactor !== undefined && (
            <span>Borrow up to {collateralFactor.toString()}% as USDC</span>
          )}
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="deposit">
          <TabsList className="w-full">
            <TabsTrigger value="deposit" className="flex-1">Deposit</TabsTrigger>
            <TabsTrigger value="withdraw" className="flex-1">Withdraw</TabsTrigger>
          </TabsList>

          {/* Deposit tab */}
          <TabsContent value="deposit" className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Amount (cirBTC)</p>
              <Input
                type="number"
                placeholder="0"
                value={depositAmount}
                onChange={(e) => setDepositAmount(clampToMax(e.target.value, maxDepositNum))}
                max={maxDepositNum}
                className="font-mono"
              />
              <QuickAmounts
                onSelect={(v) => setDepositAmount(clampToMax(v, maxDepositNum))}
                max={maxDepositNum}
                presets={["0.0001", "0.0002", "0.0005", "0.001"]}
                onMax={() => cirBtcBalance !== undefined && setDepositAmount(formatUnits(cirBtcBalance, COLLATERAL_DECIMALS))}
              />
            </div>
            {needsCirBtcApproval ? (
              <>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => approveCirBtc.approve(parseUnits("1000000", COLLATERAL_DECIMALS))}
                  disabled={approvePending || depositBigInt === 0n}
                >
                  {approvePending ? "Approving…" : "Approve cirBTC"}
                </Button>
                <TxStatus {...approveCirBtc} />
              </>
            ) : (
              <>
                <Button
                  className="w-full"
                  onClick={() => depositCollateral.deposit(depositAmount)}
                  disabled={
                    depositCollateral.isPending ||
                    depositCollateral.isConfirming ||
                    depositCollateral.isSubmitted ||
                    !depositAmount ||
                    parseFloat(depositAmount) <= 0
                  }
                >
                  {depositCollateral.isPending || depositCollateral.isConfirming || depositCollateral.isSubmitted
                    ? "Depositing…"
                    : "Deposit cirBTC"}
                </Button>
                <TxStatus {...depositCollateral} />
              </>
            )}
          </TabsContent>

          {/* Withdraw tab */}
          <TabsContent value="withdraw" className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Amount (cirBTC)</p>
              <Input
                type="number"
                placeholder="0"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(clampToMax(e.target.value, maxWithdrawNum))}
                max={maxWithdrawNum}
                className="font-mono"
              />
              <QuickAmounts
                onSelect={(v) => setWithdrawAmount(clampToMax(v, maxWithdrawNum))}
                max={maxWithdrawNum}
                presets={["0.0001", "0.0002", "0.0005", "0.001"]}
                onMax={() => availableCollateral !== undefined && setWithdrawAmount(formatUnits(availableCollateral, COLLATERAL_DECIMALS))}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Available to withdraw: <span className="font-mono text-foreground">{availableFmt} cirBTC</span>
              </p>
            </div>
            <Separator />
            <Button
              className="w-full"
              variant="outline"
              onClick={() => withdrawCollateral.withdraw(withdrawAmount)}
              disabled={
                withdrawCollateral.isPending ||
                withdrawCollateral.isConfirming ||
                withdrawCollateral.isSubmitted ||
                !withdrawAmount ||
                parseFloat(withdrawAmount) <= 0
              }
            >
              {withdrawCollateral.isPending || withdrawCollateral.isConfirming || withdrawCollateral.isSubmitted
                ? "Withdrawing…"
                : "Withdraw cirBTC"}
            </Button>
            <TxStatus {...withdrawCollateral} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Loan panel ───────────────────────────────────────────────────────────────

function LoanPanel({
  usdcAllowance,
  maxBorrow,
  loanAmount,
  loanIsActive,
  onSuccess,
}: {
  usdcAllowance: bigint | undefined;
  maxBorrow: bigint | undefined;
  loanAmount: bigint | undefined;
  loanIsActive: boolean;
  onSuccess: () => void;
}) {
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");

  const approveUsdc = useApproveUsdcForLending();
  const takeLoan = useTakeLoan();
  const repayLoan = useRepayLoan();

  useEffect(() => { if (takeLoan.isSuccess) { setBorrowAmount(""); onSuccess(); } }, [takeLoan.isSuccess, onSuccess]);
  useEffect(() => { if (repayLoan.isSuccess) { setRepayAmount(""); onSuccess(); } }, [repayLoan.isSuccess, onSuccess]);

  const repayBigInt = repayAmount ? parseUnits(repayAmount, LOAN_DECIMALS) : 0n;
  const needsUsdcApproval = usdcAllowance !== undefined && repayBigInt > 0n && repayBigInt > usdcAllowance;

  const maxBorrowNum = maxBorrow !== undefined
    ? parseFloat(formatUnits(maxBorrow, LOAN_DECIMALS))
    : undefined;
  const maxRepayNum = loanAmount !== undefined
    ? parseFloat(formatUnits(loanAmount, LOAN_DECIMALS))
    : undefined;

  function clampToMax(value: string, max: number | undefined): string {
    if (!value || max === undefined) return value;
    const n = parseFloat(value);
    if (Number.isNaN(n)) return value;
    return n > max ? max.toString() : value;
  }

  const loanAmountFmt = loanAmount !== undefined
    ? (loanAmount === 0n ? "0" : parseFloat(formatUnits(loanAmount, LOAN_DECIMALS)).toFixed(6))
    : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Loan
          <Badge variant="secondary">USDC</Badge>
          {loanIsActive && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Active</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="borrow">
          <TabsList className="w-full">
            <TabsTrigger value="borrow" className="flex-1">Borrow</TabsTrigger>
            <TabsTrigger value="repay" className="flex-1">Repay</TabsTrigger>
          </TabsList>

          {/* Borrow tab */}
          <TabsContent value="borrow" className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Amount (USDC)</p>
              <Input
                type="number"
                placeholder="0"
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(clampToMax(e.target.value, maxBorrowNum))}
                max={maxBorrowNum}
                className="font-mono"
              />
              <QuickAmounts
                onSelect={(v) => setBorrowAmount(clampToMax(v, maxBorrowNum))}
                max={maxBorrowNum}
                presets={["0.00005", "0.0001", "0.0002", "0.0005"]}
                onMax={() => maxBorrow !== undefined && setBorrowAmount(formatUnits(maxBorrow, LOAN_DECIMALS))}
              />
            </div>
            {loanIsActive ? (
              <p className="text-xs text-amber-400 text-center py-2">
                Repay your existing loan before borrowing again.
              </p>
            ) : (
              <>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => takeLoan.borrow(borrowAmount)}
                  disabled={
                    takeLoan.isPending ||
                    takeLoan.isConfirming ||
                    takeLoan.isSubmitted ||
                    !borrowAmount ||
                    parseFloat(borrowAmount) <= 0
                  }
                >
                  {takeLoan.isPending || takeLoan.isConfirming || takeLoan.isSubmitted ? "Borrowing…" : "Borrow USDC"}
                </Button>
                <TxStatus {...takeLoan} />
              </>
            )}
          </TabsContent>

          {/* Repay tab */}
          <TabsContent value="repay" className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Amount (USDC)</p>
              <Input
                type="number"
                placeholder="0"
                value={repayAmount}
                onChange={(e) => setRepayAmount(clampToMax(e.target.value, maxRepayNum))}
                max={maxRepayNum}
                className="font-mono"
              />
              <QuickAmounts
                onSelect={(v) => setRepayAmount(clampToMax(v, maxRepayNum))}
                max={maxRepayNum}
                presets={["0.00005", "0.0001", "0.0002", "0.0005"]}
                onMax={() => loanAmount !== undefined && setRepayAmount(formatUnits(loanAmount, LOAN_DECIMALS))}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Outstanding: <span className="font-mono text-foreground">{loanAmountFmt} USDC</span>
              </p>
            </div>
            <Separator />
            {!loanIsActive ? (
              <p className="text-xs text-muted-foreground text-center py-2">No active loan to repay.</p>
            ) : needsUsdcApproval ? (
              <>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => approveUsdc.approve(parseUnits("1000000", LOAN_DECIMALS))}
                  disabled={approveUsdc.isPending || approveUsdc.isConfirming || approveUsdc.isSubmitted}
                >
                  {approveUsdc.isPending || approveUsdc.isConfirming || approveUsdc.isSubmitted ? "Approving…" : "Approve USDC"}
                </Button>
                <TxStatus {...approveUsdc} />
              </>
            ) : (
              <>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => repayLoan.repay(repayAmount)}
                  disabled={
                    repayLoan.isPending ||
                    repayLoan.isConfirming ||
                    repayLoan.isSubmitted ||
                    !repayAmount ||
                    parseFloat(repayAmount) <= 0
                  }
                >
                  {repayLoan.isPending || repayLoan.isConfirming || repayLoan.isSubmitted ? "Repaying…" : "Repay USDC"}
                </Button>
                <TxStatus {...repayLoan} />
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Utilization card ─────────────────────────────────────────────────────────

function UtilizationCard({
  loanAmount,
  loanCollateral,
  loanIsActive,
  collateralFactor,
}: {
  loanAmount: bigint | undefined;
  loanCollateral: bigint | undefined;
  loanIsActive: boolean;
  collateralFactor: bigint | undefined;
}) {
  const utilizationPct =
    loanIsActive && loanCollateral && loanCollateral > 0n && loanAmount && collateralFactor
      ? Math.min(
        (parseFloat(formatUnits(loanAmount, LOAN_DECIMALS)) /
          (parseFloat(formatUnits(loanCollateral, COLLATERAL_DECIMALS)) *
            (Number(collateralFactor) / 100))) *
        100,
        100,
      )
      : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">Loan Utilization</p>
      <p className="text-lg font-semibold font-mono">
        {utilizationPct !== null ? `${utilizationPct.toFixed(1)}%` : "—"}
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-500 transition-all"
          style={{ width: `${utilizationPct ?? 0}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">
        {utilizationPct !== null ? "of borrowing limit" : "No active loan"}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LendingPage() {
  const { address, isConnected } = useWallet();
  const mounted = useSyncExternalStore(
    () => () => { },
    () => true,
    () => false,
  );

  // Treat as disconnected until after hydration to avoid SSR mismatch
  const connected = mounted && isConnected;

  const state = useLendingState(connected ? address : undefined);
  const balances = useLendingBalances(connected ? address : undefined);

  const notDeployed = LENDING_ADDRESS === "0x0000000000000000000000000000000000000000";

  function refetchAll() {
    state.refetch();
    balances.refetch();
  }

  return (
    <div className="container mx-auto max-w-4xl px-3 sm:px-4 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">cirBTC Lending</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Deposit cirBTC as collateral and borrow USDC on Arc Testnet.
        </p>
      </div>

      {/* Not-deployed banner */}
      {notDeployed && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <p className="font-medium">Contract not deployed yet</p>
          <p className="mt-0.5 text-amber-400/80">
            Run <code className="font-mono bg-amber-500/20 px-1 rounded">npm run deploy:lending</code> to deploy the LendingBorrowing contract to Arc Testnet, then restart the dev server.
          </p>
        </div>
      )}

      {/* Pool stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Pool Liquidity"
          value={`${state.poolLiquidityFormatted} USDC`}
          sub="Available to borrow"
        />
        <StatCard
          label="Your cirBTC Deposited"
          value={connected ? `${state.collateralBalanceFormatted} cirBTC` : "—"}
          sub={connected ? `${state.availableCollateralFormatted} available` : "Connect wallet"}
        />
        <StatCard
          label="Your USDC Borrowed"
          value={connected ? (state.loanIsActive ? `${state.loanAmountFormatted} USDC` : "0 USDC") : "—"}
          sub={connected && !state.loanIsActive ? `Up to ${state.maxBorrowFormatted} available` : undefined}
        />
        <UtilizationCard
          loanAmount={state.loanAmount}
          loanCollateral={state.loanCollateral}
          loanIsActive={state.loanIsActive}
          collateralFactor={state.collateralFactor}
        />
      </div>

      {/* Main panels */}
      {!connected ? (
        <div className="rounded-lg border border-border bg-card/50 p-8 text-center text-muted-foreground text-sm">
          Connect your wallet to deposit collateral and borrow.
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4 items-start">
            <CollateralPanel
              cirBtcAllowance={balances.cirBtcAllowance}
              cirBtcBalance={balances.cirBtcBalance}
              availableCollateral={state.availableCollateral}
              collateralFactor={state.collateralFactor}
              onSuccess={refetchAll}
            />
            <LoanPanel
              usdcAllowance={balances.usdcAllowance}
              maxBorrow={state.maxBorrow}
              loanAmount={state.loanAmount}
              loanIsActive={state.loanIsActive}
              onSuccess={refetchAll}
            />
          </div>
          {address && <TransactionHistory wallet={address} />}
        </>
      )}

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. <strong className="text-foreground">Get cirBTC</strong> — obtain cirBTC tokens to use as collateral.</p>
          <p>2. <strong className="text-foreground">Deposit cirBTC</strong> — approve and deposit cirBTC as collateral into the lending pool.</p>
          <p>3. <strong className="text-foreground">Borrow USDC</strong> — borrow up to {state.collateralFactor !== undefined ? `${state.collateralFactor.toString()}%` : "50%"} of your collateral value in USDC.</p>
          <p>4. <strong className="text-foreground">Repay your loan</strong> — approve USDC and repay any portion; full repayment unlocks your collateral.</p>
          <p>5. <strong className="text-foreground">Withdraw cirBTC</strong> — once the loan is repaid, retrieve your collateral.</p>
        </CardContent>
      </Card>
    </div>
  );
}
