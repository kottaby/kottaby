/**
 * SurahJuzRef + isSurahJuzRef 4-Tier Test Suite.
 * Pure unit tier — NO DB, NO schema imports.
 * Tier 1: 100% branch/statement coverage of the guard over ALL shipped members.
 * Tier 2: Boundary cases — case mismatch, whitespace, empty, primitive types.
 * Tier 3: Chaos/fuzz — random strings, 10k payloads, unicode/RTL, wildcards.
 * Tier 4: Security — coercion overrides, prototype attacks; reject, never throw.
 */
import { describe, expect, test } from "bun:test";
import { isSurahJuzRef, SurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";

/** Deterministic LCG-backed fuzz generator (same output on every run). */
function fuzzStrings(count: number): string[] {
  let seed = 8675309;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483647;
    return seed;
  };
  const alphabet = "xyzXYZ019!@#$%^&*()[]{}<>~`|;:,./? ";
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = 1 + (next() % 24);
    let candidate = "";
    for (let j = 0; j < len; j++) {
      candidate += alphabet[next() % alphabet.length];
    }
    out.push(candidate);
  }
  return out;
}

/** Module-scope fixture used by the security tier (a function masquerading as a member value). */
function memberReturningFunction(): string {
  return SurahJuzRef.Juz1;
}

describe("isSurahJuzRef", () => {
  // ---- Tier 1: Branch/Statement Coverage ----
  describe("Tier 1 — branch coverage", () => {
    test("shipped member set is frozen at 35 (5 surah refs + 30 juz) in declaration order", () => {
      const members: string[] = Object.values(SurahJuzRef);
      expect(members).toHaveLength(35);
      expect(members.slice(0, 5)).toEqual([
        "surah_al_fatihah",
        "surah_al_baqarah",
        "surah_aal_imran",
        "surah_an_nisa",
        "surah_al_maidah",
      ]);
      expect(members.slice(5)).toEqual(Array.from({ length: 30 }, (_, i) => `juz_${i + 1}`));
    });

    test("EVERY shipped enum member passes the guard (true branch, all 35)", () => {
      for (const member of Object.values(SurahJuzRef)) {
        expect(isSurahJuzRef(member)).toBe(true);
      }
    });

    test("string that is not a member fails the membership check (false branch)", () => {
      expect(isSurahJuzRef("juz_31")).toBe(false);
      expect(isSurahJuzRef("surah_al_furqan")).toBe(false);
      expect(isSurahJuzRef("page_1")).toBe(false);
    });

    test("non-string input short-circuits on the typeof check (left-false branch)", () => {
      expect(isSurahJuzRef(undefined)).toBe(false);
      expect(isSurahJuzRef(1)).toBe(false);
    });

    test("true result narrows unknown to SurahJuzRef", () => {
      const value: unknown = "juz_30";
      if (!isSurahJuzRef(value)) {
        expect.unreachable("guard should accept the exact member string");
      }
      expect(value).toBe(SurahJuzRef.Juz30);
    });
  });

  // ---- Tier 2: Boundary & Edge Cases ----
  describe("Tier 2 — boundary cases", () => {
    test("case mismatches are rejected", () => {
      expect(isSurahJuzRef("Juz_1")).toBe(false);
      expect(isSurahJuzRef("JUZ_1")).toBe(false);
      expect(isSurahJuzRef("Surah_Al_Fatihah")).toBe(false);
      expect(isSurahJuzRef("SURAH_AL_FATIHAH")).toBe(false);
      expect(isSurahJuzRef("juz_1 ")).toBe(false);
    });

    test("whitespace boundaries are rejected (trailing, leading, tab/newline)", () => {
      expect(isSurahJuzRef("juz_1 ")).toBe(false);
      expect(isSurahJuzRef(" juz_1")).toBe(false);
      expect(isSurahJuzRef("\tjuz_1")).toBe(false);
      expect(isSurahJuzRef("juz_1\n")).toBe(false);
      expect(isSurahJuzRef(" juz_1 ")).toBe(false);
    });

    test("empty string is rejected", () => {
      expect(isSurahJuzRef("")).toBe(false);
    });

    test("numeric-adjacent near-misses are rejected", () => {
      expect(isSurahJuzRef("juz_0")).toBe(false);
      expect(isSurahJuzRef("juz_00")).toBe(false);
      expect(isSurahJuzRef("juz_1.0")).toBe(false);
      expect(isSurahJuzRef("juz_+1")).toBe(false);
      expect(isSurahJuzRef("juz_30 ")).toBe(false);
      expect(isSurahJuzRef("juz_130")).toBe(false);
    });

    test("primitive non-strings are rejected", () => {
      expect(isSurahJuzRef(0)).toBe(false);
      expect(isSurahJuzRef(1)).toBe(false);
      expect(isSurahJuzRef(30)).toBe(false);
      expect(isSurahJuzRef(Number.NaN)).toBe(false);
      expect(isSurahJuzRef(true)).toBe(false);
      expect(isSurahJuzRef(false)).toBe(false);
      expect(isSurahJuzRef(undefined)).toBe(false);
      expect(isSurahJuzRef(null)).toBe(false);
    });
  });

  // ---- Tier 3: Chaos/Fuzz ----
  describe("Tier 3 — chaos & fuzz", () => {
    test("random non-member strings are ALL rejected without throwing", () => {
      for (const candidate of fuzzStrings(200)) {
        expect(isSurahJuzRef(candidate)).toBe(false);
      }
    });

    test("long strings (10k chars) are rejected", () => {
      expect(isSurahJuzRef("x".repeat(10000))).toBe(false);
      expect(isSurahJuzRef(`${SurahJuzRef.Juz1}${"@".repeat(9995)}`)).toBe(false);
      expect(isSurahJuzRef(`${"@".repeat(9995)}${SurahJuzRef.Juz30}`)).toBe(false);
    });

    test("unicode / Arabic / RTL strings are rejected", () => {
      const unicodeInputs = [
        "الجزء الأول",
        "سورة الفاتحة",
        "جزء",
        "\u200Fjuz_1",
        "juz_1\u200F",
        "\u05D0\u05D1\u05D2",
        "juz\u0661_1",
        "✅",
        "🄹🅄🅉_1",
        "juz\u0300_1",
      ];
      for (const input of unicodeInputs) {
        expect(isSurahJuzRef(input)).toBe(false);
      }
    });

    test("strings containing LIKE wildcards, underscores, backslashes and quotes are rejected", () => {
      const hostileInputs = [
        "%",
        "_",
        "\\",
        "'",
        "%\"%'\\_",
        "%juz_1",
        "juz%_1",
        "_juz_1",
        "juz_1_",
        "juz__1",
        "j'_uz_1",
        "\\njuz_1",
        "'; DROP TABLE home_work; --",
        '"juz_1"',
      ];
      for (const input of hostileInputs) {
        expect(isSurahJuzRef(input)).toBe(false);
      }
    });

    test("control characters embedded in member-like strings are rejected", () => {
      expect(isSurahJuzRef("juz\x00_1")).toBe(false);
      expect(isSurahJuzRef("juz_1\r")).toBe(false);
      expect(isSurahJuzRef("\ufeffjuz_1")).toBe(false);
    });
  });

  // ---- Tier 4: Security & Abuse ----
  describe("Tier 4 — security & abuse", () => {
    test("object with toString override returning a member is rejected WITHOUT throwing", () => {
      const malicious: unknown = { toString: () => SurahJuzRef.Juz1 };
      expect(() => isSurahJuzRef(malicious)).not.toThrow();
      expect(isSurahJuzRef(malicious)).toBe(false);
    });

    test("object with throwing toString/valueOf never triggers coercion", () => {
      const explosive: unknown = {
        toString: () => {
          throw new Error("toString should never be called by the guard");
        },
        valueOf: () => {
          throw new Error("valueOf should never be called by the guard");
        },
      };
      expect(() => isSurahJuzRef(explosive)).not.toThrow();
      expect(isSurahJuzRef(explosive)).toBe(false);
    });

    test("Object.create(null) input is rejected WITHOUT throwing", () => {
      const nullProto: unknown = Object.create(null);
      expect(() => isSurahJuzRef(nullProto)).not.toThrow();
      expect(isSurahJuzRef(nullProto)).toBe(false);

      const forgedNullProto: unknown = Object.assign(Object.create(null), { 0: "juz_1", length: 5 });
      expect(() => isSurahJuzRef(forgedNullProto)).not.toThrow();
      expect(isSurahJuzRef(forgedNullProto)).toBe(false);
    });

    test("crafted __proto__-bearing payload is rejected WITHOUT throwing", () => {
      // JSON-string-shaped attacker payload — "__proto__" lands as an own enumerable key.
      const protoPayload: Record<string, unknown> = { ["__proto__"]: { isAdmin: true }, value: "juz_1" };
      expect(() => isSurahJuzRef(protoPayload)).not.toThrow();
      expect(isSurahJuzRef(protoPayload)).toBe(false);
      expect(Object.keys(protoPayload)).toContain("__proto__");
    });

    test("Symbol masquerading as a member name is rejected WITHOUT throwing", () => {
      const symbolInput = Symbol.for("juz_1");
      expect(() => isSurahJuzRef(symbolInput)).not.toThrow();
      expect(isSurahJuzRef(symbolInput)).toBe(false);
    });

    test("arrays and functions are rejected WITHOUT throwing", () => {
      const arrayInput: unknown = [SurahJuzRef.Juz1];
      const fnInput: unknown = memberReturningFunction;
      expect(() => isSurahJuzRef(arrayInput)).not.toThrow();
      expect(isSurahJuzRef(arrayInput)).toBe(false);
      expect(() => isSurahJuzRef(fnInput)).not.toThrow();
      expect(isSurahJuzRef(fnInput)).toBe(false);
    });
  });
});
