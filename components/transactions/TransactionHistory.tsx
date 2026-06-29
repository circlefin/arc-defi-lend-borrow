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

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  SortColumn,
  SortDirection,
  TransactionRow,
  TxAction,
} from "@/lib/supabase/transactions";
import { useTransactionsQuery } from "@/hooks/useTransactions";
import { SortableHeader } from "./SortableHeader";

const PAGE_SIZES = [10, 20, 30] as const;
const EXPLORER_BASE = process.env.NEXT_PUBLIC_EXPLORER_URL;

interface TransactionHistoryProps {
  wallet: string;
}

const ACTION_STYLES: Record<TxAction, { label: string; className: string }> = {
  deposit: { label: "Deposit", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  withdraw: { label: "Withdraw", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  borrow: { label: "Borrow", className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  repay: { label: "Repay", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  mint_usdc: { label: "Mint USDC", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

export function TransactionHistory({ wallet }: TransactionHistoryProps) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(10);

  // Debounce search input -> search.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const effectiveSort = useMemo<{ column: SortColumn; direction: SortDirection }>(
    () =>
      sortColumn && sortDirection
        ? { column: sortColumn, direction: sortDirection }
        : { column: "created_at", direction: "desc" },
    [sortColumn, sortDirection],
  );

  const configured = isSupabaseConfigured();

  const { data, isLoading, isError, error } = useTransactionsQuery(
    {
      wallet,
      search,
      sortColumn: effectiveSort.column,
      sortDirection: effectiveSort.direction,
      page,
      pageSize,
    },
    configured,
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function handleToggleSort(column: SortColumn) {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("asc");
      return;
    }
    if (sortDirection === "asc") {
      setSortDirection("desc");
      return;
    }
    if (sortDirection === "desc") {
      setSortColumn(null);
      setSortDirection(null);
      return;
    }
    setSortDirection("asc");
  }

  function handlePageSizeChange(value: string | null) {
    if (value === null) return;
    setPageSize(Number(value));
    setPage(0);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transaction history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by transaction hash…"
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger size="sm" className="w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!configured ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Supabase is not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env.local</code> to
            enable transaction history.
          </div>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortableHeader
                      column="created_at"
                      label="Time"
                      activeColumn={sortColumn}
                      activeDirection={sortDirection}
                      onToggle={handleToggleSort}
                    />
                  </TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead className="text-right">
                    <SortableHeader
                      column="amount_formatted"
                      label="Amount"
                      activeColumn={sortColumn}
                      activeDirection={sortDirection}
                      onToggle={handleToggleSort}
                      className="ml-auto"
                    />
                  </TableHead>
                  <TableHead>Tx hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && rows.length === 0 ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-destructive">
                      Failed to load transactions: {error instanceof Error ? error.message : "unknown error"}
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      {search
                        ? "No transactions match your search."
                        : "No transactions yet. Your activity will show up here."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => <TransactionTableRow key={row.id} row={row} />)
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {configured && total > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                disabled={page + 1 >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransactionTableRow({ row }: { row: TransactionRow }) {
  const [copied, setCopied] = useState(false);
  const action = ACTION_STYLES[row.action];
  const short = `${row.tx_hash.slice(0, 6)}…${row.tx_hash.slice(-4)}`;

  function handleCopy() {
    navigator.clipboard
      .writeText(row.tx_hash)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => undefined);
  }

  return (
    <TableRow>
      <TableCell className="text-muted-foreground" title={new Date(row.created_at).toLocaleString()}>
        {formatRelative(row.created_at)}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={action.className}>
          {action.label}
        </Badge>
      </TableCell>
      <TableCell>{row.token}</TableCell>
      <TableCell className="text-right font-mono tabular-nums">{row.amount_formatted}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 font-mono text-xs">
          {EXPLORER_BASE ? (
            <a
              href={`${EXPLORER_BASE.replace(/\/$/, "")}/tx/${row.tx_hash}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground hover:underline transition-colors"
              title="Open in explorer"
            >
              {short}
            </a>
          ) : (
            <span>{short}</span>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Copy full hash"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
