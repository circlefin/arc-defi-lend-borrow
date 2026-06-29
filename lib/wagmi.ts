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

import { http, createConfig } from "wagmi";
import { type Chain, parseGwei } from "viem";
import { injected } from "wagmi/connectors";

export const WAGMI_POLLING_INTERVAL = 4_000;
export const LIVE_STATE_REFETCH_INTERVAL = 5_000;

const alchemyRpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://rpc.testnet.arc.network";

export const arcTestnet: Chain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [alchemyRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
  fees: {
    defaultPriorityFee: parseGwei("2"),
    baseFeeMultiplier: 2,
  },
};

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  pollingInterval: WAGMI_POLLING_INTERVAL,
  transports: {
    [arcTestnet.id]: http(alchemyRpcUrl),
  },
});
