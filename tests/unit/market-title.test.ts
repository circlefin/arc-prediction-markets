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
import { MAX_TITLE_LENGTH, MIN_TITLE_LENGTH, pairNameFor, validateTitle } from "@/lib/server/market-title";

const ch = (code: number) => String.fromCharCode(code);
const TAB = ch(9);
const NEWLINE = ch(10);

describe("validateTitle", () => {
  it("accepts a normal question and normalises whitespace", () => {
    const messy = "  Will   ETH" + TAB + "flip BTC" + NEWLINE + "by 2027? ";
    expect(validateTitle(messy)).toEqual({ ok: true, title: "Will ETH flip BTC by 2027?" });
  });

  it("accepts the length limits exactly", () => {
    expect(validateTitle("a".repeat(MIN_TITLE_LENGTH)).ok).toBe(true);
    expect(validateTitle("a".repeat(MAX_TITLE_LENGTH)).ok).toBe(true);
  });

  it("rejects a title that would make the server pay for an oversized deployment", () => {
    const result = validateTitle("a".repeat(MAX_TITLE_LENGTH + 1));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/at most/) });
    expect(validateTitle("a".repeat(1_000_000)).ok).toBe(false);
  });

  it.each([
    ["too short", "abcd"],
    ["only whitespace", "     " + NEWLINE + TAB + "  "],
    ["only punctuation", "?????!!!"],
    ["not a string", 42],
    ["null", null],
    ["undefined", undefined],
    ["an object", { title: "x" }],
  ])("rejects a title that is %s", (_name, value) => {
    expect(validateTitle(value).ok).toBe(false);
  });

  it.each([
    ["a NUL byte", 0],
    ["an escape character", 27],
    ["DEL", 127],
    ["a C1 control", 133],
  ])("rejects %s", (_name, code) => {
    expect(validateTitle("Will it rain" + ch(code) + "?")).toEqual({
      ok: false,
      error: "Title contains invalid characters",
    });
  });

  it.each([
    ["a line separator", 8232],
    ["a paragraph separator", 8233],
  ])("normalises %s to a plain space, so it cannot smuggle a line break", (_name, code) => {
    expect(validateTitle("Will it" + ch(code) + "rain?")).toEqual({ ok: true, title: "Will it rain?" });
  });

  it("keeps ordinary unicode", () => {
    expect(validateTitle("Will São Paulo host the 2030 final?").ok).toBe(true);
  });
});

describe("pairNameFor", () => {
  it("uses the first ten alphanumerics, upper-cased", () => {
    expect(pairNameFor("Will BTC top $100k in 2026?")).toBe("WILLBTCTOP");
    expect(pairNameFor("a-b c")).toBe("ABC");
  });
});
