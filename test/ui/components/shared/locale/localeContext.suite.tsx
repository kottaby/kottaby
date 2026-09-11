import { expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useAppLocale, LocaleContext } from "@/shared/locale/localeContext";
import type { ReactNode } from "react";

test("useAppLocale throws if called outside of LocaleProvider", () => {
  const originalError = console.error;
  console.error = () => {};

  expect(() => renderHook(() => useAppLocale())).toThrow("useLocaleContext must be called inside <LocaleProvider>");

  console.error = originalError;
});

test("useAppLocale returns locale when inside LocaleProvider", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LocaleContext.Provider value={{ locale: "en" }}>{children}</LocaleContext.Provider>
  );

  const { result } = renderHook(() => useAppLocale(), { wrapper });
  expect(result.current).toBe("en");
});

test("useAppLocale returns arabic locale when inside LocaleProvider", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LocaleContext.Provider value={{ locale: "ar" }}>{children}</LocaleContext.Provider>
  );

  const { result } = renderHook(() => useAppLocale(), { wrapper });
  expect(result.current).toBe("ar");
});
