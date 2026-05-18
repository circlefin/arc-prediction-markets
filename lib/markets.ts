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

import { MARKET_ADDRESS, AMM_ADDRESS } from "./contracts";

export interface MarketCardData {
  id: string;
  address: string;
  ammAddress?: string;
  title: string;
  icon: string;
  yesPrice: number;
  noPrice: number;
  volume: string;
  category: string;
  isReal?: boolean;
}

export interface DynamicMarket {
  id: string;
  address: string;
  ammAddress: string;
  title: string;
  category: string;
  createdAt: string;
}

export function dynamicToCardData(m: DynamicMarket): MarketCardData {
  return {
    id: m.id,
    address: m.address,
    ammAddress: m.ammAddress,
    title: m.title,
    icon: "\u{1F52E}",
    yesPrice: 0.5,
    noPrice: 0.5,
    volume: "$0",
    category: m.category,
    isReal: true,
  };
}

// Note: For real markets (isReal: true), yesPrice/noPrice/volume are fallback
// values only. The MarketCard component fetches live on-chain data instead.

// The real deployed contract market + mock markets for the grid display
export const MARKETS: MarketCardData[] = [
  {
    id: "btc-100k",
    address: MARKET_ADDRESS,
    ammAddress: AMM_ADDRESS,
    title: "Bitcoin above $100,000 by end of 2026?",
    icon: "₿",
    yesPrice: 0.62,
    noPrice: 0.38,
    volume: "$48.2K",
    category: "Crypto",
    isReal: true,
  },
  {
    id: "eth-10k",
    address: "0x0000000000000000000000000000000000000001",
    title: "Ethereum above $10,000 by December 2026?",
    icon: "Ξ",
    yesPrice: 0.24,
    noPrice: 0.76,
    volume: "$31.5K",
    category: "Crypto",
  },
  {
    id: "sol-500",
    address: "0x0000000000000000000000000000000000000002",
    title: "Solana above $500 by end of 2026?",
    icon: "◎",
    yesPrice: 0.18,
    noPrice: 0.82,
    volume: "$12.8K",
    category: "Crypto",
  },
  {
    id: "fed-rate-cut",
    address: "0x0000000000000000000000000000000000000003",
    title: "Fed cuts interest rates before July 2026?",
    icon: "$",
    yesPrice: 0.71,
    noPrice: 0.29,
    volume: "$89.1K",
    category: "Economy",
  },
  {
    id: "sp500-6000",
    address: "0x0000000000000000000000000000000000000004",
    title: "S&P 500 above 6,000 by end of 2026?",
    icon: "📈",
    yesPrice: 0.55,
    noPrice: 0.45,
    volume: "$72.4K",
    category: "Equities",
  },
  {
    id: "us-recession",
    address: "0x0000000000000000000000000000000000000005",
    title: "US enters recession in 2026?",
    icon: "📉",
    yesPrice: 0.32,
    noPrice: 0.68,
    volume: "$104K",
    category: "Economy",
  },
  {
    id: "gold-3000",
    address: "0x0000000000000000000000000000000000000006",
    title: "Gold above $3,000/oz by end of 2026?",
    icon: "🥇",
    yesPrice: 0.48,
    noPrice: 0.52,
    volume: "$18.7K",
    category: "Commodities",
  },
  {
    id: "btc-etf-100b",
    address: "0x0000000000000000000000000000000000000007",
    title: "Bitcoin spot ETFs exceed $100B AUM in 2026?",
    icon: "₿",
    yesPrice: 0.74,
    noPrice: 0.26,
    volume: "$56.9K",
    category: "Crypto",
  },
  {
    id: "oil-100",
    address: "0x0000000000000000000000000000000000000008",
    title: "Crude oil above $100/barrel in 2026?",
    icon: "🛢",
    yesPrice: 0.21,
    noPrice: 0.79,
    volume: "$33.1K",
    category: "Commodities",
  },
  {
    id: "china-taiwan-sanctions",
    address: "0x0000000000000000000000000000000000000009",
    title: "New US sanctions on China before 2027?",
    icon: "🇺🇸",
    yesPrice: 0.67,
    noPrice: 0.33,
    volume: "$61.2K",
    category: "Geopolitics",
  },
  {
    id: "eu-trade-deal",
    address: "0x000000000000000000000000000000000000000a",
    title: "EU–Mercosur trade deal ratified by 2027?",
    icon: "🇪🇺",
    yesPrice: 0.41,
    noPrice: 0.59,
    volume: "$14.8K",
    category: "Geopolitics",
  },
  {
    id: "brics-currency",
    address: "0x000000000000000000000000000000000000000b",
    title: "BRICS common currency announced by 2027?",
    icon: "🌍",
    yesPrice: 0.09,
    noPrice: 0.91,
    volume: "$27.5K",
    category: "Geopolitics",
  },
];
