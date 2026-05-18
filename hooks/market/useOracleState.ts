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

import { useReadContract } from "wagmi";
import { useCallback } from "react";
import { type Address } from "viem";
import { OO_V2_ABI } from "@/lib/contracts/abis/oracle";
import { OO_V2_ADDRESS } from "@/lib/contracts/addresses";
import { OracleState } from "@/lib/contracts/types";
import { useMarketAddress } from "@/contexts/MarketAddressContext";
import { LIVE_STATE_REFETCH_INTERVAL } from "@/lib/wagmi";

export function useOracleState(
  priceIdentifier: `0x${string}` | undefined,
  requestTimestamp: bigint | undefined,
  ancillaryDataHex: `0x${string}` | undefined
) {
  const { marketAddress } = useMarketAddress();

  const enabled =
    !!priceIdentifier &&
    requestTimestamp !== undefined &&
    !!ancillaryDataHex &&
    OO_V2_ADDRESS !== "0x0000000000000000000000000000000000000000";

  const args = enabled
    ? [marketAddress, priceIdentifier!, requestTimestamp!, ancillaryDataHex!] as const
    : undefined;

  const { data: stateData, refetch: refetchState } = useReadContract({
    address: OO_V2_ADDRESS,
    abi: OO_V2_ABI,
    functionName: "getState",
    args,
    query: {
      enabled,
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  const { data: requestData, refetch: refetchRequest } = useReadContract({
    address: OO_V2_ADDRESS,
    abi: OO_V2_ABI,
    functionName: "getRequest",
    args,
    query: {
      enabled,
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  const oracleState = stateData !== undefined ? (stateData as number) : undefined;
  const request = requestData as
    | {
        proposer: Address;
        disputer: Address;
        currency: Address;
        settled: boolean;
        proposedPrice: bigint;
        resolvedPrice: bigint;
        expirationTime: bigint;
        reward: bigint;
        finalFee: bigint;
        requestSettings: {
          bond: bigint;
          customLiveness: bigint;
        };
      }
    | undefined;

  const refetch = useCallback(() => {
    refetchState();
    refetchRequest();
  }, [refetchState, refetchRequest]);

  return {
    oracleState: oracleState as OracleState | undefined,
    proposer: request?.proposer,
    disputer: request?.disputer,
    proposedPrice: request?.proposedPrice,
    expirationTime: request?.expirationTime,
    finalFee: request?.finalFee,
    bond: request?.requestSettings?.bond,
    refetch,
  };
}
