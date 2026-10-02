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

import { describe, expect, it } from "vitest";
import { createCreationGuard } from "@/lib/server/creation-guard";

const HOUR = 60 * 60 * 1000;

function setup(overrides: Partial<Parameters<typeof createCreationGuard>[0]> = {}) {
  let time = 1_000_000;
  const guard = createCreationGuard({
    cooldownMs: 60_000,
    perClientMax: 3,
    perClientWindowMs: HOUR,
    now: () => time,
    ...overrides,
  });
  return { guard, advance: (ms: number) => (time += ms) };
}

describe("createCreationGuard", () => {
  it("allows a first creation", () => {
    expect(setup().guard("1.1.1.1").ok).toBe(true);
  });

  it("allows only one creation at a time, for everyone", () => {
    const { guard } = setup();
    expect(guard("1.1.1.1").ok).toBe(true);
    expect(guard("2.2.2.2")).toMatchObject({ ok: false, status: 503 });
  });

  it("enforces a cooldown after a successful creation, for everyone", () => {
    const { guard, advance } = setup();
    const first = guard("1.1.1.1");
    if (!first.ok) throw new Error("expected a permit");
    first.release("created");

    advance(10_000);
    expect(guard("2.2.2.2")).toMatchObject({ ok: false, status: 429, retryAfterSeconds: 50 });

    advance(50_000);
    expect(guard("2.2.2.2").ok).toBe(true);
  });

  it("does not start a cooldown after a failed creation", () => {
    const { guard } = setup();
    const first = guard("1.1.1.1");
    if (!first.ok) throw new Error("expected a permit");
    first.release("failed");
    expect(guard("2.2.2.2").ok).toBe(true);
  });

  it("limits one client to a few creations per window", () => {
    const { guard, advance } = setup({ cooldownMs: 0 });
    for (let i = 0; i < 3; i++) {
      const permit = guard("1.1.1.1");
      if (!permit.ok) throw new Error(`creation ${i} should be allowed`);
      permit.release("created");
      advance(1_000);
    }
    expect(guard("1.1.1.1")).toMatchObject({ ok: false, status: 429 });
    expect(guard("9.9.9.9").ok).toBe(true); // a different client is unaffected
  });

  it("forgets a client once its window has passed", () => {
    const { guard, advance } = setup({ cooldownMs: 0 });
    for (let i = 0; i < 3; i++) {
      const permit = guard("1.1.1.1");
      if (!permit.ok) throw new Error("expected a permit");
      permit.release("created");
    }
    expect(guard("1.1.1.1").ok).toBe(false);
    advance(HOUR + 1);
    expect(guard("1.1.1.1").ok).toBe(true);
  });

  it("counts a failed attempt against the client too (failures cannot be spammed for free)", () => {
    const { guard } = setup({ cooldownMs: 0 });
    for (let i = 0; i < 3; i++) {
      const permit = guard("1.1.1.1");
      if (!permit.ok) throw new Error("expected a permit");
      permit.release("failed");
    }
    expect(guard("1.1.1.1")).toMatchObject({ ok: false, status: 429 });
  });

  it("releases the single-flight lock even after a failure", () => {
    const { guard } = setup({ cooldownMs: 0 });
    const first = guard("1.1.1.1");
    if (!first.ok) throw new Error("expected a permit");
    first.release("failed");
    expect(guard("2.2.2.2").ok).toBe(true);
  });
});
