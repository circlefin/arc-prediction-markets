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

import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet, ARC_TESTNET_RPC_URL } from "./chain";

export const WAGMI_POLLING_INTERVAL = 2_000;
export const LIVE_STATE_REFETCH_INTERVAL = 5_000;

export { arcTestnet };

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  pollingInterval: WAGMI_POLLING_INTERVAL,
  transports: {
    [arcTestnet.id]: http(ARC_TESTNET_RPC_URL),
  },
});
