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

import { getSupabaseClient } from "./client";

export type TxAction = "deposit" | "withdraw" | "borrow" | "repay" | "mint_usdc";
export type TxToken = "cirBTC" | "USDC";
export type TxStatus = "confirmed" | "failed";

export interface TransactionRow {
  id: string;
  tx_hash: string;
  wallet_address: string;
  action: TxAction;
  token: TxToken;
  amount: string;
  amount_formatted: string;
  status: TxStatus;
  created_at: string;
}

export interface InsertTransactionInput {
  tx_hash: string;
  wallet_address: string;
  action: TxAction;
  token: TxToken;
  amount: string;
  amount_formatted: string;
  status?: TxStatus;
}

export type SortColumn = "created_at" | "amount_formatted";
export type SortDirection = "asc" | "desc";

export interface ListTransactionsParams {
  wallet: string;
  search?: string;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
}

export interface ListTransactionsResult {
  rows: TransactionRow[];
  total: number;
}

export async function insertTransaction(input: InsertTransactionInput): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from("transactions").insert({
    tx_hash: input.tx_hash,
    wallet_address: input.wallet_address.toLowerCase(),
    action: input.action,
    token: input.token,
    amount: input.amount,
    amount_formatted: input.amount_formatted,
    status: input.status ?? "confirmed",
  });
  // Ignore duplicate-hash conflicts; surface everything else.
  if (error && error.code !== "23505") {
    throw error;
  }
}

export async function listTransactions(
  params: ListTransactionsParams,
): Promise<ListTransactionsResult> {
  const client = getSupabaseClient();
  if (!client) return { rows: [], total: 0 };

  const from = params.page * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = client
    .from("transactions")
    .select("*", { count: "exact" })
    .eq("wallet_address", params.wallet.toLowerCase());

  if (params.search && params.search.trim().length > 0) {
    query = query.ilike("tx_hash", `%${params.search.trim()}%`);
  }

  query = query
    .order(params.sortColumn, { ascending: params.sortDirection === "asc" })
    .range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  return { rows: (data as TransactionRow[]) ?? [], total: count ?? 0 };
}
