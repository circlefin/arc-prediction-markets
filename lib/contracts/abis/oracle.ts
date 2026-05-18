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

export const OO_V2_ABI = [
  {
    inputs: [
      { name: "requester", type: "address" },
      { name: "identifier", type: "bytes32" },
      { name: "timestamp", type: "uint256" },
      { name: "ancillaryData", type: "bytes" },
    ],
    name: "getState",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "requester", type: "address" },
      { name: "identifier", type: "bytes32" },
      { name: "timestamp", type: "uint256" },
      { name: "ancillaryData", type: "bytes" },
    ],
    name: "getRequest",
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "proposer", type: "address" },
          { name: "disputer", type: "address" },
          { name: "currency", type: "address" },
          { name: "settled", type: "bool" },
          { name: "requestSettings", type: "tuple", components: [
            { name: "eventBased", type: "bool" },
            { name: "refundOnDispute", type: "bool" },
            { name: "callbackOnPriceProposed", type: "bool" },
            { name: "callbackOnPriceDisputed", type: "bool" },
            { name: "callbackOnPriceSettled", type: "bool" },
            { name: "bond", type: "uint256" },
            { name: "customLiveness", type: "uint256" },
          ]},
          { name: "proposedPrice", type: "int256" },
          { name: "resolvedPrice", type: "int256" },
          { name: "expirationTime", type: "uint256" },
          { name: "reward", type: "uint256" },
          { name: "finalFee", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "requester", type: "address" },
      { name: "identifier", type: "bytes32" },
      { name: "timestamp", type: "uint256" },
      { name: "ancillaryData", type: "bytes" },
      { name: "proposedPrice", type: "int256" },
    ],
    name: "proposePrice",
    outputs: [{ name: "totalBond", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "requester", type: "address" },
      { name: "identifier", type: "bytes32" },
      { name: "timestamp", type: "uint256" },
      { name: "ancillaryData", type: "bytes" },
    ],
    name: "disputePrice",
    outputs: [{ name: "totalBond", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "requester", type: "address" },
      { name: "identifier", type: "bytes32" },
      { name: "timestamp", type: "uint256" },
      { name: "ancillaryData", type: "bytes" },
    ],
    name: "settle",
    outputs: [{ name: "payout", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "requester", type: "address" },
      { name: "identifier", type: "bytes32" },
      { name: "timestamp", type: "uint256" },
      { name: "ancillaryData", type: "bytes" },
    ],
    name: "hasPrice",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
