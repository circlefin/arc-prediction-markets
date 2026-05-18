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
import { type Address } from "viem";
import { ERC20_ABI } from "@/lib/contracts/abis/erc20";
import { ARCT_ADDRESS } from "@/lib/contracts/addresses";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useWallet } from "@/contexts/WalletContext";
import { useMarketAddress } from "@/contexts/MarketAddressContext";
import { LIVE_STATE_REFETCH_INTERVAL } from "@/lib/wagmi";

export function useApproveArctForAMM() {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { ammAddress } = useMarketAddress();

  const approve = (amount: bigint) => {
    write({
      address: ARCT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ammAddress, amount],
    });
  };

  return { approve, isPending, isConfirming, isSuccess, error, hash };
}

export function useApproveTokenForAMM(tokenAddress: Address | undefined) {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { ammAddress } = useMarketAddress();

  const approve = (amount: bigint) => {
    if (!tokenAddress) return;
    write({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ammAddress, amount],
    });
  };

  return { approve, isPending, isConfirming, isSuccess, error, hash };
}

export function useAMMAllowances(
  longTokenAddress: Address | undefined,
  shortTokenAddress: Address | undefined
) {
  const { address } = useWallet();
  const { ammAddress } = useMarketAddress();

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: ARCT_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: address ? [address, ammAddress] : undefined,
      },
      {
        address: longTokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: address ? [address, ammAddress] : undefined,
      },
      {
        address: shortTokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: address ? [address, ammAddress] : undefined,
      },
    ],
    query: {
      enabled: !!address && !!longTokenAddress && !!shortTokenAddress,
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  return {
    arctAllowance: data?.[0]?.result as bigint | undefined,
    longAllowance: data?.[1]?.result as bigint | undefined,
    shortAllowance: data?.[2]?.result as bigint | undefined,
    isLoading,
    refetch,
  };
}
