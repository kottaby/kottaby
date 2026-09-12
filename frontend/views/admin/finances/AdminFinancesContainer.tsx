"use client";

/**
 * AdminFinancesContainer — the client orchestrator behind `/admin/finances`
 * (the admin financial auditing console): the payments audit panel, the
 * withdrawal payout queue, and the teacher wallet inspector.
 *
 * Tab state mirrors the teachers surface's shareable-URL contract: the
 * active tab lives in the `?tab=` query string (values `payments` |
 * `withdrawals` | `wallet`; ANY unknown/absent value resolves to the
 * default payments tab — fail-safe single-direction flag) and is mirrored
 * back through `router.replace` (`{ scroll: false }`, no history churn).
 * The wallet tab additionally reads the `?teacherId=` deep link once on
 * mount (a sanitized numeric token — junk falls back to the unpicked
 * picker state), and the picker's own selection writes the param back.
 *
 * Panels stay MOUNTED while hidden (the `hidden` attribute — the MUI
 * TabPanel recipe) so switching tabs preserves each tab's filter/page
 * state; all three tab queries run from mount.
 *
 * The settlement/adjustment mutations live in the panels' dialogs; every
 * outcome surfaces a container-level snackbar through
 * {@link AdminFinancesNoticeSnackbar} (success / error lanes — the raw
 * server `message` is NEVER echoed). Page-level authorization is the
 * server admin route guard — this container performs no role logic.
 *
 * MUI v9 discipline: `sx`-only styling, colors exclusively through
 * `theme.palette.*` callbacks, `*Outlined` icons only, ≥44px touch
 * targets, RTL-safe logical composition, `useAppTranslation(AdminFinance)`
 * property access for every label (no literal copy anywhere).
 */

import { Box, Card, Stack, Tab, Tabs } from "@mui/material";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { DirectoryPageHeader } from "@/frontend/views/admin/directory-shared/DirectoryPageHeader";
import {
  type FinancesTab,
  parseFinancesUrlTab,
  parseTeacherIdParam,
} from "@/frontend/views/admin/finances/finances-url-state";
import { PaymentsAuditPanel } from "@/frontend/views/admin/finances/PaymentsAuditPanel";
import { WalletInspectorPanel } from "@/frontend/views/admin/finances/WalletInspectorPanel";
import { WithdrawalQueuePanel } from "@/frontend/views/admin/finances/WithdrawalQueuePanel";
import { useAppTranslation } from "@/shared/locale/client";
import { AdminFinance } from "@/shared/locale/namespaces/adminFinance";

/** The tab ids of the three panels (stable DOM ids for the TabPanel recipe). */
const TAB_IDS: Readonly<Record<FinancesTab, { tab: string; panel: string }>> = {
  payments: { tab: "finances-tab-payments", panel: "finances-panel-payments" },
  withdrawals: { tab: "finances-tab-withdrawals", panel: "finances-panel-withdrawals" },
  wallet: { tab: "finances-tab-wallet", panel: "finances-panel-wallet" },
};

/**
 * The finances console view: always-on chrome (title + tab strip) over the
 * three kept-mounted panels, plus the container-level snackbar chrome.
 */
export function AdminFinancesContainer(): ReactNode {
  const t = useAppTranslation(AdminFinance);

  // ── Shareable-URL wiring ────────────────────────────────────────────
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<FinancesTab>(() => parseFinancesUrlTab(searchParams));
  // The wallet picker's deep-link seed — read ONCE on mount (a live params
  // ref would re-seed on every URL write; the picker owns later edits).
  const [teacherIdSeed] = useState<number | null>(() => parseTeacherIdParam(searchParams));
  // The picker's CURRENT selection (mirrored back into the URL by the
  // write effect below — the wallet tab's own key).
  const [walletTeacherId, setWalletTeacherId] = useState<number | null>(teacherIdSeed);

  // Sync the picked teacher down to the panel when the URL seed changes
  // (mount-once read; the picker's own writes flow back up through here).
  const handleWalletTeacherChange = (teacherId: number | null): void => {
    setWalletTeacherId(teacherId);
  };

  // URL write effect — mirrors the ACTIVE tab's view back into the query
  // string (defaults omitted: a pristine surface shares as the bare path).
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab !== "payments") {
      params.set("tab", activeTab);
    }
    if (activeTab === "wallet" && walletTeacherId !== null) {
      params.set("teacherId", String(walletTeacherId));
    }
    const urlQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (currentQuery !== urlQuery) {
      router.replace(urlQuery === "" ? pathname : `${pathname}?${urlQuery}`, { scroll: false });
    }
    // `currentQuery` re-runs the guard whenever the URL changes; after the
    // replace it already mirrors the active view, so the effect skips.
  }, [activeTab, walletTeacherId, router, pathname, searchParams]);

  const tabLabels: Readonly<Record<FinancesTab, string>> = {
    payments: t.paymentsTab,
    withdrawals: t.withdrawalsTab,
    wallet: t.walletInspectorTab,
  };

  return (
    <Stack spacing={3} sx={{ width: "100%", p: { xs: 2, md: 3 } }}>
      <DirectoryPageHeader title={t.title} subtitle={t.subtitle} />

      <Card
        sx={theme => ({
          borderRadius: "12px",
          border: `1px solid ${theme.palette.border.light}`,
          boxShadow: theme.palette.shadow.card,
        })}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value: FinancesTab) => {
            setActiveTab(value);
          }}
          aria-label={t.title}
          sx={theme => ({ paddingInline: 2, borderBottom: `1px solid ${theme.palette.border.light}` })}
        >
          {(Object.keys(TAB_IDS) as readonly FinancesTab[]).map(tab => (
            <Tab
              key={tab}
              value={tab}
              label={tabLabels[tab]}
              id={TAB_IDS[tab].tab}
              aria-controls={TAB_IDS[tab].panel}
              sx={{ minHeight: 48, textTransform: "none", fontWeight: 600, fontSize: 15 }}
            />
          ))}
        </Tabs>
      </Card>

      {/*
        All three panels stay MOUNTED while hidden (the `hidden` attribute —
        display:none removes them from the tab order and the accessibility
        tree) so each tab keeps its filter/page state across switches.
      */}
      <Box
        role="tabpanel"
        id={TAB_IDS.payments.panel}
        aria-labelledby={TAB_IDS.payments.tab}
        hidden={activeTab !== "payments"}
      >
        <PaymentsAuditPanel />
      </Box>

      <Box
        role="tabpanel"
        id={TAB_IDS.withdrawals.panel}
        aria-labelledby={TAB_IDS.withdrawals.tab}
        hidden={activeTab !== "withdrawals"}
      >
        <WithdrawalQueuePanel />
      </Box>

      <Box
        role="tabpanel"
        id={TAB_IDS.wallet.panel}
        aria-labelledby={TAB_IDS.wallet.tab}
        hidden={activeTab !== "wallet"}
      >
        <WalletInspectorPanel initialTeacherId={teacherIdSeed} onTeacherChange={handleWalletTeacherChange} />
      </Box>
    </Stack>
  );
}
