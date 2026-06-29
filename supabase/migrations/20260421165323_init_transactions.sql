-- Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--
-- SPDX-License-Identifier: Apache-2.0

-- Transactions history for the lending dApp.
-- Rows are written client-side after each on-chain action confirms.

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  tx_hash text not null unique,
  wallet_address text not null,
  action text not null check (action in ('deposit','withdraw','borrow','repay','mint_usdc')),
  token text not null check (token in ('cirBTC','USDC')),
  amount numeric(78, 0) not null,
  amount_formatted text not null,
  status text not null default 'confirmed' check (status in ('confirmed','failed')),
  created_at timestamptz not null default now()
);

create index transactions_wallet_created_idx
  on public.transactions (wallet_address, created_at desc);

create index transactions_hash_idx
  on public.transactions (tx_hash);

alter table public.transactions enable row level security;

create policy "read all" on public.transactions
  for select using (true);

create policy "insert all" on public.transactions
  for insert with check (true);
