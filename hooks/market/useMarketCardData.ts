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
import { type Address, formatUnits } from "viem";
import { MARKET_ABI } from "@/lib/contracts/abis/market";
import { ERC20_ABI } from "@/lib/contracts/abis/erc20";
import { AMM_ABI } from "@/lib/contracts/abis/amm";
import { COLLATERAL_DECIMALS } from "@/lib/contracts/addresses";

export function useMarketCardData(marketAddress: Address, ammAddress: Address | undefined, enabled: boolean) {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: marketAddress, abi: MARKET_ABI, functionName: "priceRequested" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "receivedSettlementPrice" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "settlementPrice" },
      { address: marketAddress, abi: MARKET_ABI, functionName: "longToken" },
    ],
    query: {
      enabled,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  });

  const priceRequested = data?.[0]?.result as boolean | undefined;
  const receivedSettlementPrice = data?.[1]?.result as boolean | undefined;
  const settlementPrice = data?.[2]?.result as bigint | undefined;
  const longTokenAddress = data?.[3]?.result as Address | undefined;

  const { data: supplyData } = useReadContracts({
    contracts: [
      {
        address: longTokenAddress,
        abi: ERC20_ABI,
        functionName: "totalSupply",
      },
    ],
    query: {
      enabled: !!longTokenAddress,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  });

  const totalSupply = supplyData?.[0]?.result as bigint | undefined;

  const hasAmm = !!ammAddress && ammAddress !== "0x0000000000000000000000000000000000000000";
  const { data: ammData } = useReadContracts({
    contracts: [
      { address: ammAddress as Address, abi: AMM_ABI, functionName: "getYesPrice" },
      { address: ammAddress as Address, abi: AMM_ABI, functionName: "initialized" },
    ],
    query: {
      enabled: hasAmm,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  });

  const ammYesPriceRaw = ammData?.[0]?.result as bigint | undefined;
  const ammInitialized = ammData?.[1]?.result as boolean | undefined;

  const ammYesPrice = ammYesPriceRaw !== undefined && ammInitialized
    ? Number(formatUnits(ammYesPriceRaw, 18))
    : undefined;

  const status: "Not Initialized" | "Active" | "Settled" = receivedSettlementPrice
    ? "Settled"
    : priceRequested
      ? "Active"
      : "Not Initialized";

  let volume: string | undefined;
  if (totalSupply !== undefined) {
    const formatted = parseFloat(formatUnits(totalSupply, COLLATERAL_DECIMALS));
    if (formatted >= 1000) {
      volume = `${(formatted / 1000).toFixed(1)}K ARCT`;
    } else {
      volume = `${formatted.toFixed(2)} ARCT`;
    }
  }

  let settlementOutcome: "YES" | "NO" | "Undetermined" | undefined;
  if (receivedSettlementPrice && settlementPrice !== undefined) {
    const price = formatUnits(settlementPrice, 18);
    if (price === "1") settlementOutcome = "YES";
    else if (price === "0") settlementOutcome = "NO";
    else settlementOutcome = "Undetermined";
  }

  return { status, volume, settlementOutcome, ammYesPrice, isLoading };
}
