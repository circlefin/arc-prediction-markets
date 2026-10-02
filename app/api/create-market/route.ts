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

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type Hex,
  stringToHex,
} from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { arcTestnet } from "@/lib/chain";

// --- Config -----------------------------------------------------------
import { validateTitle, pairNameFor } from "@/lib/server/market-title";
import { createCreationGuard } from "@/lib/server/creation-guard";
import { isAuthorizedToCreate } from "@/lib/server/bearer";
import {
  maxMarkets,
  readMarkets,
  writeMarkets,
  type StoredMarket,
} from "@/lib/server/markets-store";

// Deploying two contracts and seeding the pool takes minutes on Arc.
export const maxDuration = 300;

const PROPOSER_REWARD = parseEther("10"); // 10 ARCT
const MARKET_LIVENESS = 60n; // 1 minute (testnet)
const PROPOSER_BOND = parseEther("100"); // 100 ARCT
const AMM_FEE_BPS = 200n; // 2%
const SEED_LIQUIDITY = parseEther("1000"); // 1000 ARCT

// --- Load artifacts ---------------------------------------------------

function loadArtifact(contractPath: string) {
  const fullPath = path.resolve(process.cwd(), "artifacts", "contracts", contractPath);
  const artifact = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
  return { abi: artifact.abi, bytecode: artifact.bytecode as Hex };
}

// --- Minimal ABIs for interactions -----------------------------------

const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "ownerAddress", type: "address" },
      { name: "value", type: "uint256" },
    ],
    name: "allocateTo",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const MARKET_INIT_ABI = [
  {
    inputs: [],
    name: "initializeMarket",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const AMM_INIT_ABI = [
  {
    inputs: [{ name: "_initialLiquidity", type: "uint256" }],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/** Waits for a tx receipt with a reasonable timeout and polling interval. */
async function waitForTx(
  publicClient: ReturnType<typeof createPublicClient>,
  hash: Hex,
) {
  return publicClient.waitForTransactionReceipt({
    hash,
    pollingInterval: 2_000,
    timeout: 120_000,
  });
}

// --- Creation (called once the request has passed every control below) -------------

async function createMarket(trimmedTitle: string) {
  try {
    // Validate env vars
    const privateKey = process.env.PRIVATE_KEY?.trim();
    if (!privateKey) {
      return NextResponse.json({ error: "Server not configured: missing PRIVATE_KEY" }, { status: 500 });
    }

    const arctAddress = process.env.NEXT_PUBLIC_ARCT_ADDRESS as Address;
    const finderAddress = process.env.NEXT_PUBLIC_FINDER_ADDRESS as Address;
    const timerAddress = process.env.NEXT_PUBLIC_TIMER_ADDRESS as Address;

    if (!arctAddress || !finderAddress || !timerAddress) {
      return NextResponse.json(
        { error: "Server not configured: missing contract addresses. Run deploy script first." },
        { status: 500 }
      );
    }

    // Generate pair name from title (first 10 chars, uppercase, no spaces)
    const pairName = pairNameFor(trimmedTitle);

    // Set up viem clients
    // Use the direct Arc RPC for server-side transactions. Alchemy's mempool tracker
    // for Arc testnet is unreliable — it reports stale pending nonces, causing viem's
    // nonceManager to assign wrong nonces and transactions to hang indefinitely.
    const formattedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
    const account = privateKeyToAccount(formattedKey, { nonceManager });
    const rpcUrl = "https://rpc.testnet.arc.network";

    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(rpcUrl),
    });

    // Load artifacts
    const marketArtifact = loadArtifact(
      "EventBasedPredictionMarket.sol/EventBasedPredictionMarket.json"
    );
    const ammArtifact = loadArtifact(
      "PredictionMarketAMM.sol/PredictionMarketAMM.json"
    );

    // Check deployer's ARCT balance and mint more if needed
    const totalNeeded = PROPOSER_REWARD + SEED_LIQUIDITY; // 1010 ARCT
    const balance = await publicClient.readContract({
      address: arctAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });

    if (balance < totalNeeded) {
      const mintAmount = totalNeeded - balance + parseEther("100"); // mint extra buffer
      const mintHash = await walletClient.writeContract({
        address: arctAddress,
        abi: ERC20_ABI,
        functionName: "allocateTo",
        args: [account.address, mintAmount],
      });
      await waitForTx(publicClient, mintHash);
    }

    // Encode the question as bytes
    const customAncillaryData = stringToHex(trimmedTitle);

    // --- Deploy EventBasedPredictionMarket -----------------------------------

    const marketHash = await walletClient.deployContract({
      abi: marketArtifact.abi,
      bytecode: marketArtifact.bytecode,
      args: [
        pairName,
        arctAddress,
        customAncillaryData,
        finderAddress,
        timerAddress,
        PROPOSER_REWARD,
        MARKET_LIVENESS,
        PROPOSER_BOND,
      ],
    });

    const marketReceipt = await waitForTx(publicClient, marketHash);
    const marketAddress = marketReceipt.contractAddress;

    if (!marketAddress) {
      return NextResponse.json({ error: "Market deployment failed" }, { status: 500 });
    }

    // --- Initialize market --------------------------------------------

    // Approve proposer reward to market
    const approveMarketHash = await walletClient.writeContract({
      address: arctAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [marketAddress, PROPOSER_REWARD],
    });
    await waitForTx(publicClient, approveMarketHash);

    // Initialize market (requests price from OO)
    const initMarketHash = await walletClient.writeContract({
      address: marketAddress,
      abi: MARKET_INIT_ABI,
      functionName: "initializeMarket",
    });
    await waitForTx(publicClient, initMarketHash);

    // --- Deploy PredictionMarketAMM ------------------------------------------

    const ammHash = await walletClient.deployContract({
      abi: ammArtifact.abi,
      bytecode: ammArtifact.bytecode,
      args: [marketAddress, AMM_FEE_BPS],
    });

    const ammReceipt = await waitForTx(publicClient, ammHash);
    const ammAddress = ammReceipt.contractAddress;

    if (!ammAddress) {
      return NextResponse.json({ error: "AMM deployment failed" }, { status: 500 });
    }

    // --- Seed AMM with liquidity ---------------------------------------------

    // Approve ARCT to AMM
    const approveAmmHash = await walletClient.writeContract({
      address: arctAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ammAddress, SEED_LIQUIDITY],
    });
    await waitForTx(publicClient, approveAmmHash);

    // Initialize AMM
    const initAmmHash = await walletClient.writeContract({
      address: ammAddress,
      abi: AMM_INIT_ABI,
      functionName: "initialize",
      args: [SEED_LIQUIDITY],
    });
    await waitForTx(publicClient, initAmmHash);

    // --- Save to the registry -----------------------------------------------

    const newMarket: StoredMarket = {
      id: `user-${Date.now()}`,
      address: marketAddress,
      ammAddress: ammAddress,
      title: trimmedTitle,
      category: "Crypto",
      createdAt: new Date().toISOString(),
    };
    try {
      writeMarkets([newMarket, ...readMarkets()]);
    } catch (writeError) {
      // The contracts exist and cost real gas. Do not lose them: log where they are.
      console.error(
        `CRITICAL: market deployed but not recorded. market=${marketAddress} amm=${ammAddress} title=${JSON.stringify(trimmedTitle)}`,
        writeError
      );
      return NextResponse.json(
        {
          error: "The market was deployed but could not be saved to the list.",
          market: { address: marketAddress, ammAddress },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      market: newMarket,
    });
  } catch (error) {
    // The message can carry RPC URLs, request bodies and account details: log it, don't send it.
    console.error("Market creation failed:", error);
    return NextResponse.json({ error: "Market creation failed. Please try again later." }, { status: 500 });
  }
}

// --- POST handler ------------------------------------------------------

const guard = createCreationGuard({
  cooldownMs: Number(process.env.CREATE_MARKET_COOLDOWN_SECONDS ?? 60) * 1000,
  perClientMax: 3,
  perClientWindowMs: 60 * 60 * 1000,
});

const clientKey = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

/**
 * POST /api/create-market  { title }
 *
 * Spends the SERVER's key to deploy two contracts, mint test tokens and seed a pool, so it is
 * not left open: an optional bearer token, strict input limits, a cap on the number of
 * markets, and single-flight / cooldown / per-client limits.
 */
export async function POST(request: Request) {
  if (!isAuthorizedToCreate(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validation = validateTitle(body?.title);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (readMarkets().length >= maxMarkets()) {
    return NextResponse.json({ error: "The market limit has been reached." }, { status: 409 });
  }

  const permit = guard(clientKey(request));
  if (!permit.ok) {
    return NextResponse.json(
      { error: permit.error },
      { status: permit.status, headers: { "Retry-After": String(permit.retryAfterSeconds) } }
    );
  }

  let response: NextResponse | undefined;
  try {
    response = await createMarket(validation.title);
    return response;
  } finally {
    permit.release(response?.status === 200 ? "created" : "failed");
  }
}
