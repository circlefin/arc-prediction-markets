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

import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const accounts: string[] = (() => {
  let key = process.env.PRIVATE_KEY?.trim();
  if (!key) return [];
  if (key.startsWith("0x")) key = key.slice(2);
  if (key.length !== 64) return [];
  return [`0x${key}`];
})();

export default defineConfig({
  plugins: [hardhatEthers, hardhatVerify, hardhatNodeTestRunner],
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000000,
      },
    },
  },
  networks: {
    arcTestnet: {
      type: "http",
      url: process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || "https://rpc.testnet.arc.network",
      accounts,
      chainId: 5042002,
    },
  },
  verify: {
    etherscan: {
      apiKey: "empty",
    },
  },
  chainDescriptors: {
    5042002: {
      name: "Arc Testnet",
      blockExplorers: {
        etherscan: {
          name: "ArcScan",
          url: "https://testnet.arcscan.app",
          apiUrl: "https://testnet.arcscan.app/api",
        },
      },
    },
  },
});
