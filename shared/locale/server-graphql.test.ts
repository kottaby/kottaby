import { describe, expect, it } from "bun:test";
import { getServerTranslations } from "@/shared/locale/server-graphql";

describe("getServerTranslations", () => {
  it("should return English translations when 'en' locale is provided", () => {
    const enResult = getServerTranslations("en");
    const arResult = getServerTranslations("ar");

    expect(enResult).toBeDefined();
    expect(arResult).toBeDefined();

    // Ensure the translations object differs based on locale
    expect(enResult).not.toBe(arResult);
  });

  it("should return default translations when an invalid locale is provided", () => {
    const invalidResult = getServerTranslations("unknown-locale");
    const arResult = getServerTranslations("ar");

    expect(invalidResult).toBe(arResult);
  });
});
