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

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { type Address, type Hex, encodeFunctionData } from "viem";
import {
  useConnection,
  useConnect,
  useConnectors,
  useDisconnect,
} from "wagmi";
import {
  toWebAuthnCredential,
  toCircleSmartAccount,
  WebAuthnMode,
} from "@circle-fin/modular-wallets-core";
import { toWebAuthnAccount } from "viem/account-abstraction";
import { createBundlerClient } from "viem/account-abstraction";
import {
  getPasskeyTransport,
  getModularTransport,
  getCirclePublicClient,
  isCircleConfigured,
  estimateUserOpFees,
} from "@/lib/circle";
import { arcTestnet } from "@/lib/wagmi";

const STORAGE_KEY = "circle-wallet-credential";

interface StoredCredential {
  credentialId: string;
}

export type WalletType = "metamask" | "circle" | null;

interface CircleBundlerClient {
  sendUserOperation: (args: {
    calls: { to: Hex; data: Hex; value?: bigint }[];
    paymaster: true;
  }) => Promise<Hex>;
  waitForUserOperationReceipt: (args: { hash: Hex }) => Promise<{ receipt: { transactionHash: Hex } }>;
}

interface WalletContextValue {
  address: Address | undefined;
  isConnected: boolean;
  walletType: WalletType;
  bundlerClient: CircleBundlerClient | null;
  connectMetaMask: () => void;
  connectCircle: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  circleError: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  // Wagmi (MetaMask) state
  const { address: wagmiAddress, isConnected: wagmiConnected } = useConnection();
  const { mutate: wagmiConnect, isPending: wagmiPending } = useConnect();
  const connectors = useConnectors();
  const { mutate: wagmiDisconnect } = useDisconnect();

  // Circle state
  const [circleAddress, setCircleAddress] = useState<Address | undefined>();
  const [bundlerClient, setBundlerClient] = useState<CircleBundlerClient | null>(null);
  const [circleConnecting, setCircleConnecting] = useState(false);
  const [circleError, setCircleError] = useState<string | null>(null);
  const restoringRef = useRef(false);

  // Determine active wallet
  const walletType: WalletType = wagmiConnected
    ? "metamask"
    : circleAddress
      ? "circle"
      : null;

  const address = walletType === "metamask" ? wagmiAddress : circleAddress;
  const isConnected = walletType !== null;

  const initCircleAccount = useCallback(
    async (credential: Awaited<ReturnType<typeof toWebAuthnCredential>>) => {
      const owner = toWebAuthnAccount({ credential });

      const smartAccount = await toCircleSmartAccount({
        client: getCirclePublicClient(),
        owner,
      });

      const client = createBundlerClient({
        account: smartAccount,
        chain: arcTestnet,
        transport: getModularTransport(),
        paymaster: true,
        userOperation: {
          estimateFeesPerGas: estimateUserOpFees,
        },
      });

      setCircleAddress(smartAccount.address);
      setBundlerClient(client as unknown as CircleBundlerClient);
    },
    [],
  );

  const connectCircle = useCallback(async () => {
    setCircleConnecting(true);
    setCircleError(null);
    try {
      if (!isCircleConfigured()) {
        throw new Error(
          "Circle wallet is not configured. Set NEXT_PUBLIC_CIRCLE_CLIENT_KEY and NEXT_PUBLIC_CIRCLE_CLIENT_URL in .env.local.",
        );
      }
      // Disconnect MetaMask if connected
      if (wagmiConnected) wagmiDisconnect();

      let credential: Awaited<ReturnType<typeof toWebAuthnCredential>>;

      // Try login first (existing passkey), fall back to register
      try {
        credential = await toWebAuthnCredential({
          transport: getPasskeyTransport(),
          mode: WebAuthnMode.Login,
        });
      } catch {
        const username = `user_${crypto.randomUUID().slice(0, 8)}`;
        credential = await toWebAuthnCredential({
          transport: getPasskeyTransport(),
          mode: WebAuthnMode.Register,
          username,
        });
      }

      await initCircleAccount(credential);

      const stored: StoredCredential = { credentialId: credential.id };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (err) {
      console.error("Circle wallet connection failed:", err);
      setCircleError(
        err instanceof Error ? err.message : "Failed to connect passkey wallet",
      );
    } finally {
      setCircleConnecting(false);
    }
  }, [wagmiConnected, wagmiDisconnect, initCircleAccount]);

  const connectMetaMask = useCallback(() => {
    // Clear Circle state if active
    if (circleAddress) {
      setCircleAddress(undefined);
      setBundlerClient(null);
      localStorage.removeItem(STORAGE_KEY);
    }
    wagmiConnect({ connector: connectors[0] });
  }, [circleAddress, wagmiConnect, connectors]);

  const disconnect = useCallback(() => {
    if (walletType === "metamask") {
      wagmiDisconnect();
    } else if (walletType === "circle") {
      setCircleAddress(undefined);
      setBundlerClient(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [walletType, wagmiDisconnect]);

  // Restore Circle session from localStorage on mount
  useEffect(() => {
    if (restoringRef.current) return;
    if (!isCircleConfigured()) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || wagmiConnected) return;

    restoringRef.current = true;
    const stored: StoredCredential = JSON.parse(raw);

    (async () => {
      try {
        setCircleConnecting(true);
        const credential = await toWebAuthnCredential({
          transport: getPasskeyTransport(),
          mode: WebAuthnMode.Login,
          credentialId: stored.credentialId,
        });
        await initCircleAccount(credential);
      } catch (err) {
        console.error("Failed to restore Circle session:", err);
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setCircleConnecting(false);
        restoringRef.current = false;
      }
    })();
  }, [wagmiConnected, initCircleAccount]);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected,
        walletType,
        bundlerClient,
        connectMetaMask,
        connectCircle,
        disconnect,
        isConnecting: wagmiPending || circleConnecting,
        circleError,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

// Helper: encode a contract call as a UserOperation call object
export function encodeContractCall(params: {
  address: Address;
  abi: readonly Record<string, unknown>[];
  functionName: string;
  args?: readonly unknown[];
}): { to: Hex; data: Hex; value?: bigint } {
  return {
    to: params.address as Hex,
    data: encodeFunctionData({
      abi: params.abi,
      functionName: params.functionName,
      args: params.args as unknown[],
    }),
  };
}
