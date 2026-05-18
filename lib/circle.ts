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

import { createPublicClient, http, parseGwei, type PublicClient } from "viem";
import {
  toPasskeyTransport,
  toModularTransport,
} from "@circle-fin/modular-wallets-core";
import type { CustomTransport } from "viem";
import { arcTestnet, ARC_TESTNET_RPC_URL } from "./chain";

const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY ?? "";
const clientUrl = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL ?? "";

const PLACEHOLDER_VALUES = ["your_circle_client_key_here", "your_circle_client_url_here", ""];

export function isCircleConfigured(): boolean {
  return !PLACEHOLDER_VALUES.includes(clientKey) && !PLACEHOLDER_VALUES.includes(clientUrl);
}

let _passkeyTransport: CustomTransport | null = null;
let _modularTransport: CustomTransport | null = null;
let _circlePublicClient: PublicClient | null = null;
let _directPublicClient: PublicClient | null = null;

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

// Direct (non-bundler) RPC client — used for reading on-chain state like the
// current block's baseFeePerGas without going through the Circle modular transport.
export function getDirectPublicClient(): PublicClient {
  if (!_directPublicClient) {
    _directPublicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(ARC_TESTNET_RPC_URL),
    });
  }
  return _directPublicClient;
}

// --- UserOperation gas pricing ----------------------------------------
//
// Circle's bundler (Pimlico-compatible) rejects UserOps priced against the
// wrong source — the network's eth_gasPrice and the bundler's required gas
// price can diverge. Ask the bundler first via `pimlico_getUserOperationGasPrice`,
// then fall back to `block.baseFeePerGas * 2 + MIN_PRIORITY_FEE` if that RPC
// method isn't available.

const MIN_PRIORITY_FEE = parseGwei("1");
// Last-resort base fee used only when a block is fetched but baseFeePerGas is
// missing (non-EIP-1559 block shape). Not a ceiling — just a sentinel.
const FALLBACK_BASE_FEE = parseGwei("48");

interface PimlicoGasPriceTier {
  maxFeePerGas: `0x${string}` | string;
  maxPriorityFeePerGas: `0x${string}` | string;
}

interface PimlicoGasPrice {
  slow?: PimlicoGasPriceTier;
  standard?: PimlicoGasPriceTier;
  fast?: PimlicoGasPriceTier;
}

interface BundlerRequester {
  request: (args: { method: string }) => Promise<unknown>;
}

export async function estimateUserOpFees({
  bundlerClient,
}: {
  bundlerClient: unknown;
}): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const fees = (await (bundlerClient as BundlerRequester)
    .request({ method: "pimlico_getUserOperationGasPrice" })
    .catch(() => null)) as PimlicoGasPrice | null;

  const tier = fees?.fast ?? fees?.standard ?? fees?.slow;
  if (tier) {
    const priority = BigInt(tier.maxPriorityFeePerGas);
    return {
      maxFeePerGas: BigInt(tier.maxFeePerGas),
      maxPriorityFeePerGas:
        priority < MIN_PRIORITY_FEE ? MIN_PRIORITY_FEE : priority,
    };
  }

  const block = await getDirectPublicClient().getBlock();
  const baseFee = block.baseFeePerGas ?? FALLBACK_BASE_FEE;
  return {
    maxFeePerGas: baseFee * 2n + MIN_PRIORITY_FEE,
    maxPriorityFeePerGas: MIN_PRIORITY_FEE,
  };
}
