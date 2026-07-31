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

const TRANSACTIONS_API = "/api/transactions";

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error;
    }
  } catch {
    // Ignore parsing errors and fall back to status text.
  }
  return response.statusText || "Request failed";
}

export async function insertTransaction(input: InsertTransactionInput): Promise<void> {
  const response = await fetch(TRANSACTIONS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

export async function listTransactions(
  params: ListTransactionsParams,
): Promise<ListTransactionsResult> {
  const url = new URL(TRANSACTIONS_API, window.location.origin);
  url.searchParams.set("wallet", params.wallet);
  url.searchParams.set("search", params.search ?? "");
  url.searchParams.set("sortColumn", params.sortColumn);
  url.searchParams.set("sortDirection", params.sortDirection);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const payload = (await response.json()) as ListTransactionsResult;
  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    total: typeof payload.total === "number" ? payload.total : 0,
  };
}