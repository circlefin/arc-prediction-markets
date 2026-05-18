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

import { useEffect, useSyncExternalStore } from "react";
import { useChainId, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { arcTestnet, LIVE_STATE_REFETCH_INTERVAL } from "@/lib/wagmi";
import { useWallet } from "@/contexts/WalletContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ARCT_ADDRESS, ERC20_ABI, COLLATERAL_DECIMALS } from "@/lib/contracts";
import { useMintArct } from "@/hooks/useMarket";
import { CopyableText } from "./CopyableText";
import { ConnectDialog } from "./ConnectDialog";

export function ConnectWallet() {
  const { address, isConnected, walletType, disconnect } = useWallet();
  const chainId = useChainId();
  const mounted = useSyncExternalStore(() => () => { }, () => true, () => false);
  const queryClient = useQueryClient();

  const { data: arctBalance, isLoading: isBalanceLoading } = useReadContract({
    address: ARCT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && ARCT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
    },
  });

  const mintArct = useMintArct();

  useEffect(() => {
    if (mintArct.isSuccess) queryClient.invalidateQueries();
  }, [mintArct.isSuccess, queryClient]);

  if (!mounted) return null;

  if (!isConnected) {
    return <ConnectDialog />;
  }

  const isWrongChain = walletType === "metamask" && chainId !== arcTestnet.id;
  const formattedBalance = arctBalance !== undefined
    ? parseFloat(formatUnits(arctBalance as bigint, COLLATERAL_DECIMALS)).toFixed(2)
    : null;

  const walletLabel = walletType === "circle" ? "Passkey" : "MetaMask";

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="inline-flex items-center">
        <span className="text-muted-foreground mr-1">ARCT:</span>
        {isBalanceLoading ? (
          <Skeleton className="inline-block h-4 w-20 align-middle" />
        ) : formattedBalance !== null ? (
          <span className="font-medium">{formattedBalance}</span>
        ) : null}
        <button
          onClick={() => mintArct.mint("1000")}
          disabled={mintArct.isPending || mintArct.isConfirming}
          className={`rounded px-2 py-0.5 ml-1 text-xs font-medium transition-colors disabled:opacity-50 ${mintArct.error
            ? "bg-red-600/15 text-red-500 hover:bg-red-600/25"
            : "bg-green-600/15 text-green-500 hover:bg-green-600/25"
            }`}
          title={mintArct.error ? `Error: ${mintArct.error.message}` : "Mint 1000 ARCT test tokens"}
        >
          {mintArct.isPending || mintArct.isConfirming
            ? "Minting..."
            : mintArct.error
              ? "Mint failed"
              : mintArct.isSuccess
                ? "Minted!"
                : "Faucet"}
        </button>
      </span>
      <span className="text-muted-foreground/40">|</span>
      <span>
        <CopyableText value={address!}>
          <code className="text-sm">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </code>
        </CopyableText>
        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {walletLabel}
        </span>
      </span>
      {isWrongChain && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-destructive font-medium">Wrong Network</span>
        </>
      )}
      <Button variant="outline" size="sm" onClick={disconnect}>
        Disconnect
      </Button>
    </div>
  );
}
