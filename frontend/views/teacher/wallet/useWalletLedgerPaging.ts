"use client";

/**
 * useWalletLedgerPaging — the "load more" state machine behind the
 * teacher wallet's paginated ledger (the F10 forward item, now delivered).
 *
 * Design (per `sharedDocuments/AGENTS.md` — `useLazyQuery` is banned):
 * the next-page fetch is a `useQuery` gated by a `skip` request slot. A
 * "load more" click fills the slot (`request = offset`); the completion
 * effect appends the fetched window, records the pagination truth
 * (`totalCount` / `hasMore`), and empties the slot back to idle. An error
 * empties the slot too — the button returns to a retryable idle and the
 * container surfaces the notice through its `onError` callback.
 *
 * The wallet's own first page (the 50-row window `myWallet` always
 * carries) is the newest-first truth: whenever Apollo hands a NEW page
 * identity — the `requestWithdrawal` mutation's cache convergence, any
 * refetch — the loaded older windows are DROPPED and the ledger re-bases
 * on the fresh page (honest pagination over a shuffling list; the merged
 * render dedupes by row id against the first page first, so a
 * mid-flight settlement can never render a row twice).
 *
 * The page fetch is `no-cache`: a page is a transient read window, not a
 * cacheable entity — Apollo never writes it, so it cannot collide with
 * the normalized `Wallet:<id>` convergence the mutation rides (the
 * `WalletLedgerPage` wire type carries no `id` by design).
 *
 * Money discipline: rows are rendered verbatim; this module performs no
 * arithmetic on amounts (ids are the only dedupe key).
 */

import { useQuery } from "@apollo/client/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MyWalletQuery_myWallet_transactions } from "@/frontend/graphql/generated/gql/graphql";
import { myWalletLedgerQueryDocument } from "@/frontend/graphql/sharedDocuments";

/** One canonical ledger row (the same wire row shape both surfaces expose). */
type LedgerRow = MyWalletQuery_myWallet_transactions;

/**
 * The page size for every "load more" window — the documented v1 ledger
 * surface cap (the server clamps to the same envelope). Module-private:
 * the wire cap lives with the service; this is the client mirror.
 */
const WALLET_LEDGER_PAGE_SIZE = 50;

/** The pagination truth the ledger footer + button render. */
export interface WalletLedgerPagingState {
  /** The merged newest-first rows (first page + loaded older windows). */
  readonly rows: readonly LedgerRow[];
  /** The server-side ledger total once a page fetch has landed; null before. */
  readonly totalCount: number | null;
  /** Whether a further page may exist (best-guess before the first fetch). */
  readonly hasMore: boolean;
  /** True while a "load more" window is in flight. */
  readonly loadingMore: boolean;
  /** Requests the next older window (no-op while one is already in flight). */
  readonly loadMore: () => void;
}

/** Dedupes `next` rows against `base` by row id, keeping the first occurrence. */
function mergeRows(base: readonly LedgerRow[], next: readonly LedgerRow[]): LedgerRow[] {
  const seen = new Set<string>();
  const merged: LedgerRow[] = [];
  for (const row of [...base, ...next]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

/** The ledger "load more" state machine — see the module docblock. */
export function useWalletLedgerPaging(
  firstPage: readonly LedgerRow[] | undefined,
  onError?: () => void
): WalletLedgerPagingState {
  const [olderRows, setOlderRows] = useState<readonly LedgerRow[]>([]);
  const [meta, setMeta] = useState<{ readonly totalCount: number; readonly hasMore: boolean } | null>(null);
  const [request, setRequest] = useState<number | null>(null);

  // Re-base on every fresh first-page identity (withdrawal convergence,
  // refetch): older windows are dropped, the request slot is emptied.
  useEffect(() => {
    setOlderRows([]);
    setMeta(null);
    setRequest(null);
  }, []);

  const { data, loading, error } = useQuery(myWalletLedgerQueryDocument, {
    skip: request === null,
    variables: { limit: WALLET_LEDGER_PAGE_SIZE, offset: request ?? 0 },
    fetchPolicy: "no-cache",
  });

  useEffect(() => {
    if (request === null) return;
    if (error !== undefined) {
      // The window failed — back to a retryable idle; the container owns
      // the user-facing notice.
      setRequest(null);
      onError?.();
      return;
    }
    if (loading || data === undefined) return;
    const page = data.myWalletLedger;
    setOlderRows(prev => mergeRows(prev, page.rows));
    setMeta({ totalCount: page.totalCount, hasMore: page.hasMore });
    setRequest(null);
  }, [data, error, loading, onError, request]);

  const loadMore = useCallback((): void => {
    if (firstPage === undefined) return;
    setRequest(prev => prev ?? firstPage.length + olderRows.length);
  }, [firstPage, olderRows.length]);

  const rows = useMemo(() => (firstPage === undefined ? [] : mergeRows(firstPage, olderRows)), [firstPage, olderRows]);

  // Before the first fetch the server total is unknown: the surface cap
  // makes a full first page the honest "there may be more" signal.
  const hasMore = meta !== null ? meta.hasMore : firstPage !== undefined && firstPage.length >= WALLET_LEDGER_PAGE_SIZE;

  return {
    rows,
    totalCount: meta?.totalCount ?? null,
    hasMore,
    loadingMore: request !== null && loading,
    loadMore,
  };
}
