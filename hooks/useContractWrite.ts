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

import { useState, useCallback } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { type Abi, type Address, type Hex, encodeFunctionData } from "viem";
import { useWallet } from "@/contexts/WalletContext";
import { WAGMI_POLLING_INTERVAL } from "@/lib/wagmi";

interface ContractWriteParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export function useContractWrite() {
  const { walletType, bundlerClient } = useWallet();
  const publicClient = usePublicClient();

  const { writeContractAsync } = useWriteContract();

  const [hash, setHash] = useState<Hex | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const write = useCallback(
    async (params: ContractWriteParams) => {
      setIsPending(true);
      setIsConfirming(false);
      setIsSuccess(false);
      setError(null);
      setHash(undefined);

      if (walletType === "circle" && bundlerClient) {
        try {
          const data = encodeFunctionData({
            abi: params.abi,
            functionName: params.functionName,
            args: params.args as unknown[],
          });

          const userOpHash = await bundlerClient.sendUserOperation({
            calls: [{ to: params.address as Hex, data }],
            paymaster: true,
          });

          setIsPending(false);
          setIsConfirming(true);

          const { receipt } = await bundlerClient.waitForUserOperationReceipt({
            hash: userOpHash,
          });

          setHash(receipt.transactionHash);
          setIsConfirming(false);
          setIsSuccess(true);
        } catch (err) {
          setIsPending(false);
          setIsConfirming(false);
          setError(err instanceof Error ? err : new Error("Transaction failed"));
        }
      } else {
        try {
          if (!publicClient) {
            throw new Error("No public client available");
          }

          const txHash = await writeContractAsync({
            address: params.address,
            abi: params.abi,
            functionName: params.functionName,
            args: params.args as unknown[],
          });

          setHash(txHash);
          setIsPending(false);
          setIsConfirming(true);

          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            pollingInterval: WAGMI_POLLING_INTERVAL,
          });

          setHash(receipt.transactionHash);
          setIsConfirming(false);
          setIsSuccess(true);
        } catch (err) {
          setIsPending(false);
          setIsConfirming(false);
          setError(err instanceof Error ? err : new Error("Transaction failed"));
        }
      }
    },
    [walletType, bundlerClient, publicClient, writeContractAsync],
  );

  return {
    write,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}
