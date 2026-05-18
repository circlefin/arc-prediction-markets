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
import { formatUnits } from "viem";
import { AMM_ABI } from "@/lib/contracts/abis/amm";
import { useMarketAddress } from "@/contexts/MarketAddressContext";
import { LIVE_STATE_REFETCH_INTERVAL } from "@/lib/wagmi";

export function useAMMState() {
  const { ammAddress } = useMarketAddress();

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { address: ammAddress, abi: AMM_ABI, functionName: "getYesPrice" },
      { address: ammAddress, abi: AMM_ABI, functionName: "getNoPrice" },
      { address: ammAddress, abi: AMM_ABI, functionName: "reserveYes" },
      { address: ammAddress, abi: AMM_ABI, functionName: "reserveNo" },
      { address: ammAddress, abi: AMM_ABI, functionName: "feeBps" },
      { address: ammAddress, abi: AMM_ABI, functionName: "initialized" },
    ],
    query: {
      enabled: ammAddress !== "0x0000000000000000000000000000000000000000",
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  const yesPriceRaw = data?.[0]?.result as bigint | undefined;
  const noPriceRaw = data?.[1]?.result as bigint | undefined;
  const reserveYes = data?.[2]?.result as bigint | undefined;
  const reserveNo = data?.[3]?.result as bigint | undefined;
  const feeBps = data?.[4]?.result as bigint | undefined;
  const initialized = data?.[5]?.result as boolean | undefined;

  const yesPrice = yesPriceRaw !== undefined ? Number(formatUnits(yesPriceRaw, 16)) : undefined;
  const noPrice = noPriceRaw !== undefined ? Number(formatUnits(noPriceRaw, 16)) : undefined;

  return {
    yesPrice,
    noPrice,
    yesPriceRaw,
    noPriceRaw,
    reserveYes,
    reserveNo,
    feeBps,
    initialized,
    isLoading,
    refetch,
  };
}
