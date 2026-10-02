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

export const MIN_TITLE_LENGTH = 5;
export const MAX_TITLE_LENGTH = 140;

export type TitleResult = { ok: true; title: string } | { ok: false; error: string };

/** C0 and C1 control characters, DEL, and the Unicode line and paragraph separators. */
function hasControlCharacters(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) {
      return true;
    }
  }
  return false;
}

/**
 * Validates and normalises the market question.
 *
 * The title becomes contract constructor data (the oracle question) and is stored, so its
 * length sets the gas the server pays to deploy it: an unbounded title lets a caller choose
 * the size of the bill. Control characters are rejected because the text is shown to users
 * and passed to the oracle.
 */
export function validateTitle(input: unknown): TitleResult {
  if (typeof input !== "string") return { ok: false, error: "Title is required" };

  // Whitespace (including tabs and newlines) collapses to single spaces before the checks.
  const title = input.replace(/\s+/g, " ").trim();

  if (title.length < MIN_TITLE_LENGTH) {
    return { ok: false, error: `Title must be at least ${MIN_TITLE_LENGTH} characters` };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `Title must be at most ${MAX_TITLE_LENGTH} characters` };
  }
  if (hasControlCharacters(title)) {
    return { ok: false, error: "Title contains invalid characters" };
  }
  if (!/[a-zA-Z0-9]/.test(title)) {
    return { ok: false, error: "Title must contain letters or numbers" };
  }

  return { ok: true, title };
}

/** Token symbol suffix for the market's Yes/No pair: first 10 alphanumerics, upper-cased. */
export function pairNameFor(title: string): string {
  return title.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10).toUpperCase();
}
