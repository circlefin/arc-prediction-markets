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

import { useReadContracts } from "wagmi";
import { hexToString } from "viem";
import { type Address } from "viem";
import { MARKET_ABI } from "@/lib/contracts/abis/market";
import { useMarketAddress } from "@/contexts/MarketAddressContext";
import { LIVE_STATE_REFETCH_INTERVAL } from "@/lib/wagmi";

export function useMarketState() {
  const { marketAddress } = useMarketAddress();

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { address: marketAddress, abi: MARKET_ABI, functionName: "pairName" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "customAncillaryData" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "priceRequested" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "receivedSettlementPrice" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "settlementPrice" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "longToken" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "shortToken" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "requestTimestamp" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "priceIdentifier" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "proposerReward" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "optimisticOracleProposerBond" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "optimisticOracleLivenessTime" },
    ],
    query: {
      enabled: marketAddress !== "0x0000000000000000000000000000000000000000",
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  const pairName = data?.[0]?.result as string | undefined;
  const ancillaryDataHex = data?.[1]?.result as `0x${string}` | undefined;
  const priceRequested = data?.[2]?.result as boolean | undefined;
  const receivedSettlementPrice = data?.[3]?.result as boolean | undefined;
  const settlementPrice = data?.[4]?.result as bigint | undefined;
  const longTokenAddress = data?.[5]?.result as Address | undefined;
  const shortTokenAddress = data?.[6]?.result as Address | undefined;
  const requestTimestamp = data?.[7]?.result as bigint | undefined;
  const priceIdentifier = data?.[8]?.result as `0x${string}` | undefined;
  const proposerReward = data?.[9]?.result as bigint | undefined;
  const proposerBond = data?.[10]?.result as bigint | undefined;
  const livenessTime = data?.[11]?.result as bigint | undefined;

  let question: string | undefined;
  if (ancillaryDataHex) {
    try {
      question = hexToString(ancillaryDataHex);
    } catch {
      question = undefined;
    }
  }

  return {
    pairName,
    question,
    ancillaryDataHex,
    priceRequested,
    receivedSettlementPrice,
    settlementPrice,
    longTokenAddress,
    shortTokenAddress,
    requestTimestamp,
    priceIdentifier,
    proposerReward,
    proposerBond,
    livenessTime,
    isLoading,
    refetch,
  };
}
