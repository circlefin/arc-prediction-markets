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

import { useReadContracts, useReadContract } from "wagmi";
import { type Address } from "viem";
import { ERC20_ABI } from "@/lib/contracts/abis/erc20";
import { ARCT_ADDRESS, OO_V2_ADDRESS } from "@/lib/contracts/addresses";
import { useWallet } from "@/contexts/WalletContext";
import { useMarketAddress } from "@/contexts/MarketAddressContext";
import { LIVE_STATE_REFETCH_INTERVAL } from "@/lib/wagmi";

export function useTokenBalances(
  longTokenAddress: Address | undefined,
  shortTokenAddress: Address | undefined
) {
  const { address } = useWallet();
  const { marketAddress } = useMarketAddress();

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: ARCT_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        address: longTokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        address: shortTokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        address: ARCT_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: address ? [address, marketAddress] : undefined,
      },
    ],
    query: {
      enabled: !!address && !!longTokenAddress && !!shortTokenAddress,
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  return {
    arctBalance: data?.[0]?.result as bigint | undefined,
    longBalance: data?.[1]?.result as bigint | undefined,
    shortBalance: data?.[2]?.result as bigint | undefined,
    arctAllowance: data?.[3]?.result as bigint | undefined,
    isLoading,
    refetch,
  };
}

export function useOracleAllowance() {
  const { address } = useWallet();

  const { data, isLoading, refetch } = useReadContract({
    address: ARCT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, OO_V2_ADDRESS] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  return {
    oracleAllowance: data as bigint | undefined,
    isLoading,
    refetch,
  };
}
