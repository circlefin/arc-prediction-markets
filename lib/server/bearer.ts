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

import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * When CREATE_MARKET_TOKEN is set, market creation requires `Authorization: Bearer <token>`.
 * Compared in constant time. When it is unset the endpoint is open (demo mode) and only the
 * limits in creation-guard apply.
 */
export function isAuthorizedToCreate(
  authorizationHeader: string | null,
  token = process.env.CREATE_MARKET_TOKEN,
): boolean {
  if (!token) return true;
  const presented = authorizationHeader?.match(/^Bearer (.+)$/)?.[1];
  if (!presented) return false;
  return timingSafeEqual(digest(presented), digest(token));
}
