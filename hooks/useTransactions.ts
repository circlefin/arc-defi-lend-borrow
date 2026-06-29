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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  insertTransaction,
  listTransactions,
  type InsertTransactionInput,
  type ListTransactionsParams,
} from "@/lib/supabase/transactions";

export function useTransactionsQuery(params: ListTransactionsParams, enabled: boolean) {
  return useQuery({
    queryKey: [
      "transactions",
      params.wallet.toLowerCase(),
      params.search ?? "",
      params.sortColumn,
      params.sortDirection,
      params.page,
      params.pageSize,
    ],
    queryFn: () => listTransactions(params),
    enabled: enabled && params.wallet.length > 0,
    placeholderData: (prev) => prev,
  });
}

export function useLogTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InsertTransactionInput) => insertTransaction(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
