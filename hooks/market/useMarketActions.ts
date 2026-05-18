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

import { type Address, parseUnits } from "viem";
import { ERC20_ABI, TESTNET_ERC20_ABI } from "@/lib/contracts/abis/erc20";
import { MARKET_ABI } from "@/lib/contracts/abis/market";
import { ARCT_ADDRESS, COLLATERAL_DECIMALS } from "@/lib/contracts/addresses";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useWallet } from "@/contexts/WalletContext";
import { useMarketAddress } from "@/contexts/MarketAddressContext";

export function useApproveArct(spender: Address) {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();

  const approve = (amount: bigint) => {
    write({
      address: ARCT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    });
  };

  return { approve, isPending, isConfirming, isSuccess, error, hash };
}

export function useMintArct() {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { address } = useWallet();

  const mint = (amount: string) => {
    if (!address) return;
    const parsed = parseUnits(amount, COLLATERAL_DECIMALS);
    write({
      address: ARCT_ADDRESS,
      abi: TESTNET_ERC20_ABI,
      functionName: "allocateTo",
      args: [address, parsed],
    });
  };

  return { mint, isPending, isConfirming, isSuccess, error, hash };
}

export function useCreatePosition() {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { marketAddress } = useMarketAddress();

  const create = (amount: string) => {
    const parsed = parseUnits(amount, COLLATERAL_DECIMALS);
    write({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: "create",
      args: [parsed],
    });
  };

  return { create, isPending, isConfirming, isSuccess, error, hash };
}

export function useRedeemPosition() {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { marketAddress } = useMarketAddress();

  const redeem = (amount: string) => {
    const parsed = parseUnits(amount, COLLATERAL_DECIMALS);
    write({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: "redeem",
      args: [parsed],
    });
  };

  return { redeem, isPending, isConfirming, isSuccess, error, hash };
}

export function useSettlePosition() {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { marketAddress } = useMarketAddress();

  const settle = (longAmount: bigint, shortAmount: bigint) => {
    write({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: "settle",
      args: [longAmount, shortAmount],
    });
  };

  return { settle, isPending, isConfirming, isSuccess, error, hash };
}
