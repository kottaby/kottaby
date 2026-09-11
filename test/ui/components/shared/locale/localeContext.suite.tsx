import { expect, spyOn, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { type ReactNode, useMemo } from "react";
import { LocaleContext, type LocaleContextValue, useAppLocale } from "@/shared/locale/localeContext";

function EnglishWrapper({ children }: Readonly<{ children: ReactNode }>) {
  const value = useMemo<LocaleContextValue>(() => ({ locale: "en" }), []);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function ArabicWrapper({ children }: Readonly<{ children: ReactNode }>) {
  const value = useMemo<LocaleContextValue>(() => ({ locale: "ar" }), []);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

test("useAppLocale throws if called outside of LocaleProvider", () => {
  // Suppress the expected React error boundary console.error to keep the test output clean
  const spy = spyOn(console, "error").mockImplementation(() => {});

  expect(() => renderHook(() => useAppLocale())).toThrow("useLocaleContext must be called inside <LocaleProvider>");

  spy.mockRestore();
});

test("useAppLocale returns locale when inside LocaleProvider", () => {
  const { result } = renderHook(() => useAppLocale(), { wrapper: EnglishWrapper });
  expect(result.current).toBe("en");
});

test("useAppLocale returns arabic locale when inside LocaleProvider", () => {
  const { result } = renderHook(() => useAppLocale(), { wrapper: ArabicWrapper });
  expect(result.current).toBe("ar");
});
