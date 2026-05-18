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
import { parseUnits } from "viem";
import { AMM_ABI } from "@/lib/contracts/abis/amm";
import { COLLATERAL_DECIMALS } from "@/lib/contracts/addresses";
import { useMarketAddress } from "@/contexts/MarketAddressContext";

export function useCalcBuy(outcome: "yes" | "no", amount: string) {
  const { ammAddress } = useMarketAddress();

  const amountBigInt = amount && parseFloat(amount) > 0
    ? parseUnits(amount, COLLATERAL_DECIMALS)
    : 0n;

  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: ammAddress,
        abi: AMM_ABI,
        functionName: outcome === "yes" ? "calcBuyYes" : "calcBuyNo",
        args: [amountBigInt],
      },
    ],
    query: {
      enabled: amountBigInt > 0n,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  });

  const tokensOut = data?.[0]?.result as bigint | undefined;

  return { tokensOut, isLoading };
}

export function useCalcSell(outcome: "yes" | "no", tokenAmount: string) {
  const { ammAddress } = useMarketAddress();

  const amountBigInt = tokenAmount && parseFloat(tokenAmount) > 0
    ? parseUnits(tokenAmount, COLLATERAL_DECIMALS)
    : 0n;

  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: ammAddress,
        abi: AMM_ABI,
        functionName: outcome === "yes" ? "calcSellYes" : "calcSellNo",
        args: [amountBigInt],
      },
    ],
    query: {
      enabled: amountBigInt > 0n,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  });

  const collateralOut = data?.[0]?.result as bigint | undefined;

  return { collateralOut, isLoading };
}
