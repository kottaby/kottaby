// Re-export the locale hooks from `@/shared/locale` so frontend consumers
// can depend on a stable frontend import path while keeping the Fast Refresh
// surface of `LocaleProvider.tsx` component-only.
export { useAppLocale } from "@/shared/locale";
