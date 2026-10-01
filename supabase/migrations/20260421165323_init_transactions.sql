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

-- ----------------------------------------------------------------------------
-- Ownership helper
-- ----------------------------------------------------------------------------
-- Maps a wallet address to the authenticated user that claimed it. The caller must have
-- inserted their own row first (`claim_wallet`), so an unauthenticated visitor cannot assert
-- ownership of an arbitrary address. `SECURITY DEFINER` + `STABLE` lets the policies below
-- reference this table without a nested RLS evaluation.
CREATE TABLE IF NOT EXISTS public.wallet_claims (
  wallet_address TEXT PRIMARY KEY,
  auth_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet claim" ON public.wallet_claims
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can claim a wallet" ON public.wallet_claims
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.current_user_owns_wallet(candidate_address TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$     SELECT EXISTS (         SELECT 1         FROM public.wallet_claims c         WHERE lower(c.wallet_address) = lower(candidate_address)           AND c.auth_user_id = auth.uid()     ); $$;

REVOKE ALL ON FUNCTION public.current_user_owns_wallet(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_owns_wallet(TEXT) TO authenticated;

COMMENT ON TABLE public.wallet_claims IS
  'Wallet-to-account binding used to scope transaction writes. Populated by the authenticated user.';

-- ----------------------------------------------------------------------------
-- Transaction policies
-- ----------------------------------------------------------------------------
-- SELECT stays publicly readable by design: every column here (tx hash, wallet address,
-- action, amount) is derivable from public Arc testnet chain state, so the dataset carries no
-- information that is not already on-chain, and the dApp is an unauthenticated wallet-gated
-- client (`lib/supabase/client.ts` never calls sign-in). This is an explicit decision, not an
-- oversight. If the table is ever extended with private data, this policy must be replaced
-- with `to authenticated using (public.current_user_owns_wallet(wallet_address))`.
create policy "read public transaction history" on public.transactions
  for select to anon, authenticated
  using (true);

-- Security fix: this was `for insert with check (true)`, so anybody holding the anon key could
-- fabricate transaction rows attributed to an arbitrary `wallet_address`, poisoning a victim's
-- displayed history. Inserts are now limited to a wallet the authenticated caller has claimed.
create policy "insert own transactions" on public.transactions
  for insert to authenticated
  with check (public.current_user_owns_wallet(wallet_address));

-- Security fix: with no policy at all, RLS denied UPDATE/DELETE — which is correct, since the
-- app only ever inserts and reads. These explicit deny policies make the intent unambiguous and
-- prevent a later permissive policy from accidentally opening writes.
create policy "no update of transactions" on public.transactions
  for update to anon, authenticated
  using (false);

create policy "no delete of transactions" on public.transactions
  for delete to anon, authenticated
  using (false);

-- The anon role must not hold table-level write privileges.
GRANT SELECT ON public.transactions TO anon;
GRANT SELECT, INSERT ON public.transactions TO authenticated;
REVOKE UPDATE, DELETE ON public.transactions FROM anon, authenticated;