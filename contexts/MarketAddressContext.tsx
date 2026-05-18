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

import { createContext, useContext, type ReactNode } from "react";
import { type Address } from "viem";
import { MARKET_ADDRESS, AMM_ADDRESS } from "@/lib/contracts";

interface MarketAddressContextValue {
  marketAddress: Address;
  ammAddress: Address;
}

const MarketAddressContext = createContext<MarketAddressContextValue>({
  marketAddress: MARKET_ADDRESS,
  ammAddress: AMM_ADDRESS,
});

export function MarketAddressProvider({
  marketAddress,
  ammAddress,
  children,
}: {
  marketAddress: Address;
  ammAddress: Address;
  children: ReactNode;
}) {
  return (
    <MarketAddressContext.Provider value={{ marketAddress, ammAddress }}>
      {children}
    </MarketAddressContext.Provider>
  );
}

export function useMarketAddress() {
  return useContext(MarketAddressContext);
}
