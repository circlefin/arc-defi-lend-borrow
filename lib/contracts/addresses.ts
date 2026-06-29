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

import { type Address } from "viem";

export const CIRBTC_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_CIRBTC_ADDRESS as Address) ??
  "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF";

export const USDC_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_USDC_ADDRESS as Address) ??
  "0x0000000000000000000000000000000000000000";

export const LENDING_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_LENDING_ADDRESS as Address) ??
  "0x0000000000000000000000000000000000000000";

// cirBTC is the collateral token (8 decimals, fixed by Circle's deployment).
// USDC is the loan token; the mock is deployed with 8 decimals so the contract's
// percentage math stays exact with no decimal conversion. If this is ever pointed
// at canonical USDC (6 decimals), update LOAN_DECIMALS accordingly — every
// loan-side amount (balance, allowance, maxBorrow, loan amount, repay) is
// formatted/parsed through LOAN_DECIMALS.
export const COLLATERAL_DECIMALS = 8;
export const LOAN_DECIMALS = 8;
