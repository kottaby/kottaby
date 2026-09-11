import { describe, expect, it, spyOn } from "bun:test";
import * as serverLocale from "@/shared/locale/server";
import { getServerTranslations } from "@/shared/locale/server-graphql";

describe("getServerTranslations", () => {
  it("should call getTranslations with the provided locale and return the result", () => {
    // Setup
    const expectedResult = serverLocale.getDefaultTranslations();
    const getTranslationsSpy = spyOn(serverLocale, "getTranslations").mockReturnValue(expectedResult);

    // Act
    const result = getServerTranslations("ar");

    // Assert
    expect(getTranslationsSpy).toHaveBeenCalledWith("ar");
    expect(result).toBe(expectedResult);

    // Cleanup
    getTranslationsSpy.mockRestore();
  });
});
