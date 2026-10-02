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

import { useCallback, useState } from "react";
import { usePublicClient } from "wagmi";
import { parseUnits } from "viem";
import { AMM_ABI } from "@/lib/contracts/abis/amm";
import { COLLATERAL_DECIMALS } from "@/lib/contracts/addresses";
import { minAfterSlippage } from "@/lib/slippage";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useMarketAddress } from "@/contexts/MarketAddressContext";

type Trade = {
  /** The on-chain function that performs the trade. */
  fn: "buyYes" | "buyNo" | "sellYes" | "sellNo";
  /** The view function that previews it. */
  quote: "calcBuyYes" | "calcBuyNo" | "calcSellYes" | "calcSellNo";
};

/**
 * Shared by the four trade hooks. Reads a fresh quote at the moment of submitting and passes
 * it, less the slippage tolerance, as the trade's minimum output. If the pool moves against
 * the trader before it is mined (a sandwich, or just another trade), it reverts instead of
 * executing at a worse price. A failed quote read is surfaced, never replaced by "no floor".
 */
function useProtectedTrade({ fn, quote }: Trade) {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { ammAddress } = useMarketAddress();
  const publicClient = usePublicClient();
  const [quoteError, setQuoteError] = useState<Error | null>(null);

  const trade = useCallback(
    async (amount: string) => {
      setQuoteError(null);
      try {
        if (!publicClient) throw new Error("No public client available");
        const parsed = parseUnits(amount, COLLATERAL_DECIMALS);
        const expected = (await publicClient.readContract({
          address: ammAddress,
          abi: AMM_ABI,
          functionName: quote,
          args: [parsed],
        })) as bigint;

        await write({
          address: ammAddress,
          abi: AMM_ABI,
          functionName: fn,
          args: [parsed, minAfterSlippage(expected)],
        });
      } catch (err) {
        setQuoteError(err instanceof Error ? err : new Error("Could not price the trade"));
      }
    },
    [publicClient, ammAddress, write, fn, quote],
  );

  return { trade, isPending, isConfirming, isSuccess, error: quoteError ?? error, hash };
}

export function useBuyYes() {
  const { trade, ...state } = useProtectedTrade({ fn: "buyYes", quote: "calcBuyYes" });
  return { buy: trade, ...state };
}

export function useBuyNo() {
  const { trade, ...state } = useProtectedTrade({ fn: "buyNo", quote: "calcBuyNo" });
  return { buy: trade, ...state };
}

export function useSellYes() {
  const { trade, ...state } = useProtectedTrade({ fn: "sellYes", quote: "calcSellYes" });
  return { sell: trade, ...state };
}

export function useSellNo() {
  const { trade, ...state } = useProtectedTrade({ fn: "sellNo", quote: "calcSellNo" });
  return { sell: trade, ...state };
}
