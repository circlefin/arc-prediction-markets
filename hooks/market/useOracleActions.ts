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

import { usePublicClient, useWriteContract } from "wagmi";
import { useState, useCallback } from "react";
import { encodeFunctionData } from "viem";
import { OO_V2_ABI } from "@/lib/contracts/abis/oracle";
import { TIMER_ABI } from "@/lib/contracts/abis/timer";
import { OO_V2_ADDRESS, TIMER_ADDRESS } from "@/lib/contracts/addresses";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useWallet } from "@/contexts/WalletContext";
import { useMarketAddress } from "@/contexts/MarketAddressContext";
import { WAGMI_POLLING_INTERVAL } from "@/lib/wagmi";

export function useProposePrice(
  priceIdentifier: `0x${string}` | undefined,
  requestTimestamp: bigint | undefined,
  ancillaryDataHex: `0x${string}` | undefined
) {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { marketAddress } = useMarketAddress();

  const propose = (proposedPrice: bigint) => {
    if (!priceIdentifier || requestTimestamp === undefined || !ancillaryDataHex) return;
    write({
      address: OO_V2_ADDRESS,
      abi: OO_V2_ABI,
      functionName: "proposePrice",
      args: [marketAddress, priceIdentifier, requestTimestamp, ancillaryDataHex, proposedPrice],
    });
  };

  return { propose, isPending, isConfirming, isSuccess, error, hash };
}

export function useProposePriceWithTimer(
  priceIdentifier: `0x${string}` | undefined,
  requestTimestamp: bigint | undefined,
  ancillaryDataHex: `0x${string}` | undefined
) {
  const { walletType, bundlerClient } = useWallet();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { marketAddress } = useMarketAddress();

  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hash, setHash] = useState<`0x${string}` | undefined>();

  const hasTimer = TIMER_ADDRESS !== "0x0000000000000000000000000000000000000000";

  const propose = useCallback(async (proposedPrice: bigint) => {
    if (!priceIdentifier || requestTimestamp === undefined || !ancillaryDataHex) return;

    setIsPending(true);
    setIsConfirming(false);
    setIsSuccess(false);
    setError(null);
    setHash(undefined);

    try {
      const proposeData = encodeFunctionData({
        abi: OO_V2_ABI,
        functionName: "proposePrice",
        args: [marketAddress, priceIdentifier, requestTimestamp, ancillaryDataHex, proposedPrice],
      });

      if (walletType === "circle" && bundlerClient) {
        const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];

        if (hasTimer) {
          calls.push({
            to: TIMER_ADDRESS as `0x${string}`,
            data: encodeFunctionData({
              abi: TIMER_ABI,
              functionName: "setCurrentTime",
              args: [BigInt(Math.floor(Date.now() / 1000))],
            }),
          });
        }

        calls.push({ to: OO_V2_ADDRESS as `0x${string}`, data: proposeData });

        setIsConfirming(true);
        setIsPending(false);

        const opHash = await bundlerClient.sendUserOperation({
          calls,
          paymaster: true,
        });
        const { receipt } = await bundlerClient.waitForUserOperationReceipt({ hash: opHash });
        setHash(receipt.transactionHash);
      } else {
        if (!publicClient) {
          throw new Error("No public client available");
        }

        if (hasTimer) {
          await writeContractAsync({
            address: TIMER_ADDRESS,
            abi: TIMER_ABI,
            functionName: "setCurrentTime",
            args: [BigInt(Math.floor(Date.now() / 1000))],
          });
        }

        setIsConfirming(true);
        setIsPending(false);

        const txHash = await writeContractAsync({
          address: OO_V2_ADDRESS,
          abi: OO_V2_ABI,
          functionName: "proposePrice",
          args: [marketAddress, priceIdentifier, requestTimestamp, ancillaryDataHex, proposedPrice],
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          pollingInterval: WAGMI_POLLING_INTERVAL,
        });
        setHash(receipt.transactionHash);
      }

      setIsConfirming(false);
      setIsSuccess(true);
    } catch (err) {
      setIsPending(false);
      setIsConfirming(false);
      setError(err instanceof Error ? err : new Error("Proposal failed"));
    }
  }, [priceIdentifier, requestTimestamp, ancillaryDataHex, marketAddress, hasTimer, walletType, bundlerClient, publicClient, writeContractAsync]);

  return { propose, isPending, isConfirming, isSuccess, error, hash };
}

export function useDisputePrice(
  priceIdentifier: `0x${string}` | undefined,
  requestTimestamp: bigint | undefined,
  ancillaryDataHex: `0x${string}` | undefined
) {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { marketAddress } = useMarketAddress();

  const dispute = () => {
    if (!priceIdentifier || requestTimestamp === undefined || !ancillaryDataHex) return;
    write({
      address: OO_V2_ADDRESS,
      abi: OO_V2_ABI,
      functionName: "disputePrice",
      args: [marketAddress, priceIdentifier, requestTimestamp, ancillaryDataHex],
    });
  };

  return { dispute, isPending, isConfirming, isSuccess, error, hash };
}

export function useSettleOracleRequest(
  priceIdentifier: `0x${string}` | undefined,
  requestTimestamp: bigint | undefined,
  ancillaryDataHex: `0x${string}` | undefined
) {
  const { write, isPending, isConfirming, isSuccess, error, hash } = useContractWrite();
  const { marketAddress } = useMarketAddress();

  const settleOracle = () => {
    if (!priceIdentifier || requestTimestamp === undefined || !ancillaryDataHex) return;
    write({
      address: OO_V2_ADDRESS,
      abi: OO_V2_ABI,
      functionName: "settle",
      args: [marketAddress, priceIdentifier, requestTimestamp, ancillaryDataHex],
    });
  };

  return { settleOracle, isPending, isConfirming, isSuccess, error, hash };
}

export function useSettleOracleWithTimer(
  priceIdentifier: `0x${string}` | undefined,
  requestTimestamp: bigint | undefined,
  ancillaryDataHex: `0x${string}` | undefined
) {
  const { walletType, bundlerClient } = useWallet();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { marketAddress } = useMarketAddress();

  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hash, setHash] = useState<`0x${string}` | undefined>();

  const hasTimer = TIMER_ADDRESS !== "0x0000000000000000000000000000000000000000";

  const settleOracle = useCallback(async () => {
    if (!priceIdentifier || requestTimestamp === undefined || !ancillaryDataHex) return;

    setIsPending(true);
    setIsConfirming(false);
    setIsSuccess(false);
    setError(null);
    setHash(undefined);

    try {
      const settleData = encodeFunctionData({
        abi: OO_V2_ABI,
        functionName: "settle",
        args: [marketAddress, priceIdentifier, requestTimestamp, ancillaryDataHex],
      });

      if (walletType === "circle" && bundlerClient) {
        const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];

        if (hasTimer) {
          calls.push({
            to: TIMER_ADDRESS as `0x${string}`,
            data: encodeFunctionData({
              abi: TIMER_ABI,
              functionName: "setCurrentTime",
              args: [BigInt(Math.floor(Date.now() / 1000))],
            }),
          });
        }

        calls.push({ to: OO_V2_ADDRESS as `0x${string}`, data: settleData });

        setIsConfirming(true);
        setIsPending(false);

        const opHash = await bundlerClient.sendUserOperation({
          calls,
          paymaster: true,
        });
        const { receipt } = await bundlerClient.waitForUserOperationReceipt({ hash: opHash });
        setHash(receipt.transactionHash);
      } else {
        if (!publicClient) {
          throw new Error("No public client available");
        }

        if (hasTimer) {
          await writeContractAsync({
            address: TIMER_ADDRESS,
            abi: TIMER_ABI,
            functionName: "setCurrentTime",
            args: [BigInt(Math.floor(Date.now() / 1000))],
          });
        }

        setIsConfirming(true);
        setIsPending(false);

        const txHash = await writeContractAsync({
          address: OO_V2_ADDRESS,
          abi: OO_V2_ABI,
          functionName: "settle",
          args: [marketAddress, priceIdentifier, requestTimestamp, ancillaryDataHex],
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          pollingInterval: WAGMI_POLLING_INTERVAL,
        });
        setHash(receipt.transactionHash);
      }

      setIsConfirming(false);
      setIsSuccess(true);
    } catch (err) {
      setIsPending(false);
      setIsConfirming(false);
      setError(err instanceof Error ? err : new Error("Settlement failed"));
    }
  }, [priceIdentifier, requestTimestamp, ancillaryDataHex, marketAddress, hasTimer, walletType, bundlerClient, publicClient, writeContractAsync]);

  return { settleOracle, isPending, isConfirming, isSuccess, error, hash };
}
