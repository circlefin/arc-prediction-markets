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

import { parseUnits } from "viem";
import { AMM_ABI } from "@/lib/contracts/abis/amm";
import { COLLATERAL_DECIMALS } from "@/lib/contracts/addresses";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useMarketAddress } from "@/contexts/MarketAddressContext";

export function useBuyYes() {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { ammAddress } = useMarketAddress();

  const buy = (amount: string) => {
    const parsed = parseUnits(amount, COLLATERAL_DECIMALS);
    write({
      address: ammAddress,
      abi: AMM_ABI,
      functionName: "buyYes",
      args: [parsed],
    });
  };

  return { buy, isPending, isConfirming, isSuccess, error, hash };
}

export function useBuyNo() {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { ammAddress } = useMarketAddress();

  const buy = (amount: string) => {
    const parsed = parseUnits(amount, COLLATERAL_DECIMALS);
    write({
      address: ammAddress,
      abi: AMM_ABI,
      functionName: "buyNo",
      args: [parsed],
    });
  };

  return { buy, isPending, isConfirming, isSuccess, error, hash };
}

export function useSellYes() {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { ammAddress } = useMarketAddress();

  const sell = (tokenAmount: string) => {
    const parsed = parseUnits(tokenAmount, COLLATERAL_DECIMALS);
    write({
      address: ammAddress,
      abi: AMM_ABI,
      functionName: "sellYes",
      args: [parsed],
    });
  };

  return { sell, isPending, isConfirming, isSuccess, error, hash };
}

export function useSellNo() {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { ammAddress } = useMarketAddress();

  const sell = (tokenAmount: string) => {
    const parsed = parseUnits(tokenAmount, COLLATERAL_DECIMALS);
    write({
      address: ammAddress,
      abi: AMM_ABI,
      functionName: "sellNo",
      args: [parsed],
    });
  };

  return { sell, isPending, isConfirming, isSuccess, error, hash };
}
