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

import Link from "next/link";
import { ConnectWallet } from "./wallet/ConnectWallet";

export function Navbar() {
  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto max-w-4xl flex flex-col gap-2 py-2 px-3 sm:px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:h-14 sm:py-0">
        <Link href="/lending" className="flex items-center gap-2 font-bold text-base sm:text-lg shrink-0">
          <span className="text-xl">◈</span>
          <span>Arc Borrow &amp; Lend</span>
        </Link>
        <ConnectWallet />
      </div>
    </nav>
  );
}
