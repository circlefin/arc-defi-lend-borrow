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

import { createPublicClient, type PublicClient } from "viem";
import {
  toPasskeyTransport,
  toModularTransport,
} from "@circle-fin/modular-wallets-core";
import type { CustomTransport } from "viem";
import { arcTestnet } from "./wagmi";

const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY ?? "";
const clientUrl = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL ?? "";

const PLACEHOLDER_VALUES = ["your_circle_client_key_here", "your_circle_client_url_here", ""];

export function isCircleConfigured(): boolean {
  return !PLACEHOLDER_VALUES.includes(clientKey) && !PLACEHOLDER_VALUES.includes(clientUrl);
}

let _passkeyTransport: CustomTransport | null = null;
let _modularTransport: CustomTransport | null = null;
let _circlePublicClient: PublicClient | null = null;

function assertCircleConfigured(): void {
  if (!isCircleConfigured()) {
    throw new Error(
      "Circle wallet is not configured. Set NEXT_PUBLIC_CIRCLE_CLIENT_KEY and NEXT_PUBLIC_CIRCLE_CLIENT_URL in your .env.local file.",
    );
  }
}

export function getPasskeyTransport(): CustomTransport {
  assertCircleConfigured();
  if (!_passkeyTransport) {
    _passkeyTransport = toPasskeyTransport(clientUrl, clientKey);
  }
  return _passkeyTransport;
}

export function getModularTransport(): CustomTransport {
  assertCircleConfigured();
  if (!_modularTransport) {
    _modularTransport = toModularTransport(
      `${clientUrl}/arcTestnet`,
      clientKey,
    );
  }
  return _modularTransport;
}

export function getCirclePublicClient(): PublicClient {
  assertCircleConfigured();
  if (!_circlePublicClient) {
    _circlePublicClient = createPublicClient({
      chain: arcTestnet,
      transport: getModularTransport(),
    });
  }
  return _circlePublicClient;
}
