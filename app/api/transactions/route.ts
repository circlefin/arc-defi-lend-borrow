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

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type {
  InsertTransactionInput,
  ListTransactionsResult,
  SortColumn,
  SortDirection,
  TransactionRow,
  TxAction,
  TxStatus,
  TxToken,
} from "@/lib/transactions/api";

const ACTIONS = new Set<TxAction>(["deposit", "withdraw", "borrow", "repay", "mint_usdc"]);
const TOKENS = new Set<TxToken>(["cirBTC", "USDC"]);
const STATUSES = new Set<TxStatus>(["confirmed", "failed"]);
const SORT_COLUMNS: Record<SortColumn, string> = {
  created_at: "created_at",
  amount_formatted: "amount_formatted",
};
const SORT_DIRECTIONS: Record<SortDirection, "ASC" | "DESC"> = {
  asc: "ASC",
  desc: "DESC",
};

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL environment variable");
  }

  pool = new Pool({ connectionString });
  return pool;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parsePage(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parsePageSize(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
}

function parseSortColumn(value: string | null): SortColumn {
  return value === "amount_formatted" ? "amount_formatted" : "created_at";
}

function parseSortDirection(value: string | null): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function serverError(message = "Internal server error") {
  return NextResponse.json({ error: message }, { status: 500 });
}

function isDuplicateHashError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: string }).code === "23505";
}

async function ensureSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.transactions (
      id uuid PRIMARY KEY,
      tx_hash text NOT NULL UNIQUE,
      wallet_address text NOT NULL,
      action text NOT NULL CHECK (action in ('deposit','withdraw','borrow','repay','mint_usdc')),
      token text NOT NULL CHECK (token in ('cirBTC','USDC')),
      amount numeric(78, 0) NOT NULL,
      amount_formatted text NOT NULL,
      status text NOT NULL DEFAULT 'confirmed' CHECK (status in ('confirmed','failed')),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS transactions_wallet_created_idx
      ON public.transactions (wallet_address, created_at desc);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS transactions_hash_idx
      ON public.transactions (tx_hash);
  `);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = asString(searchParams.get("wallet")).trim().toLowerCase();
    if (!wallet) return badRequest("wallet is required");

    const search = asString(searchParams.get("search")).trim();
    const sortColumn = parseSortColumn(searchParams.get("sortColumn"));
    const sortDirection = parseSortDirection(searchParams.get("sortDirection"));
    const page = parsePage(searchParams.get("page"), 0);
    const pageSize = parsePageSize(searchParams.get("pageSize"), 10);

    const sqlSortColumn = SORT_COLUMNS[sortColumn];
    const sqlSortDirection = SORT_DIRECTIONS[sortDirection];
    const offset = page * pageSize;

    const where: string[] = ["wallet_address = $1"];
    const values: Array<string | number> = [wallet];

    if (search.length > 0) {
      values.push(`%${search}%`);
      where.push(`tx_hash ILIKE $${values.length}`);
    }

    const whereClause = `WHERE ${where.join(" AND ")}`;

    const client = await getPool().connect();
    try {
      await ensureSchema(client);

      const listSql = `
        SELECT id, tx_hash, wallet_address, action, token, amount::text AS amount, amount_formatted, status, created_at
        FROM public.transactions
        ${whereClause}
        ORDER BY ${sqlSortColumn} ${sqlSortDirection}
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      const countSql = `
        SELECT COUNT(*)::int AS total
        FROM public.transactions
        ${whereClause}
      `;

      const [listResult, countResult] = await Promise.all([
        client.query<TransactionRow>(listSql, values),
        client.query<{ total: number }>(countSql, values),
      ]);

      const payload: ListTransactionsResult = {
        rows: listResult.rows,
        total: countResult.rows[0]?.total ?? 0,
      };
      return NextResponse.json(payload);
    } finally {
      client.release();
    }
  } catch (error) {
    return serverError(error instanceof Error ? error.message : undefined);
  }
}

export async function POST(request: Request) {
  let body: InsertTransactionInput;

  try {
    body = (await request.json()) as InsertTransactionInput;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const txHash = asString(body.tx_hash).trim();
  const walletAddress = asString(body.wallet_address).trim().toLowerCase();
  const amount = asString(body.amount).trim();
  const amountFormatted = asString(body.amount_formatted).trim();
  const action = body.action;
  const token = body.token;
  const status = body.status ?? "confirmed";

  if (!txHash) return badRequest("tx_hash is required");
  if (!walletAddress) return badRequest("wallet_address is required");
  if (!ACTIONS.has(action)) return badRequest("action is invalid");
  if (!TOKENS.has(token)) return badRequest("token is invalid");
  if (!amount) return badRequest("amount is required");
  if (!amountFormatted) return badRequest("amount_formatted is required");
  if (!STATUSES.has(status)) return badRequest("status is invalid");

  try {
    const client = await getPool().connect();
    try {
      await ensureSchema(client);
      await client.query(
        `
          INSERT INTO public.transactions
            (id, tx_hash, wallet_address, action, token, amount, amount_formatted, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [randomUUID(), txHash, walletAddress, action, token, amount, amountFormatted, status],
      );
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (isDuplicateHashError(error)) {
        return NextResponse.json({ ok: true });
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return serverError(error instanceof Error ? error.message : undefined);
  }
}
