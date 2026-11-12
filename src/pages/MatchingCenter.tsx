import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Reveal from '../components/Reveal';
import WidgetError from '../components/WidgetError';
import { InvoiceToast } from '../components/invoices';
import { getNavItem } from '../config/navigation';
import { errorMessage } from '../services/api';
import {
  MATCH_STATUS_LABEL,
  confirmMatch,
  fetchMatchingResults,
  humanDateTime,
  runMatches,
  type MatchStatus,
  type MatchingResultsResponse,
} from '../services/matchingService';

const { label, description } = getNavItem('/matching');

const FILTERS: Array<{ value: 'all' | MatchStatus; label: string }> = [
  { value: 'all', label: 'All Pairs' },
  { value: 'matched', label: 'Matched' },
  { value: 'matched_with_variance', label: 'Variance' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'exception', label: 'Exception' },
];

/** Badge colour by match status. */
function statusBadge(status: MatchStatus) {
  const map: Record<MatchStatus, { bg: string; text: string }> = {
    matched: { bg: 'bg-emerald-50', text: 'text-emerald-800' },
    matched_with_variance: { bg: 'bg-amber-50', text: 'text-amber-800' },
    needs_review: { bg: 'bg-surface-container-high', text: 'text-on-surface-variant' },
    duplicate: { bg: 'bg-error-container', text: 'text-on-error-container' },
    exception: { bg: 'bg-error-container', text: 'text-on-error-container' },
  };
  const style = map[status] ?? map.needs_review;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm font-semibold ${style.bg} ${style.text}`}
    >
      {MATCH_STATUS_LABEL[status]}
    </span>
  );
}

function MatchingCenter() {
  const [data, setData] = useState<MatchingResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | MatchStatus>('all');
  const [running, setRunning] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success');
  const toastTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToastTone(tone);
    setToastMessage(message);
    toastTimer.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimer.current = null;
    }, 6000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setToastMessage(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMatchingResults());
    } catch (err) {
      setData(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Append the next page of match records (newest-first), keeping the page cap honest. */
  const loadMore = useCallback(async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      const next = await fetchMatchingResults({ offset: data.pairs.length });
      if (next.errors.matches) {
        // Keep the rows already on screen; surface the failure as a toast only.
        notify(next.errors.matches, 'error');
        return;
      }
      setData({ ...next, pairs: [...data.pairs, ...next.pairs] });
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [data, notify]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      const summary = await runMatches();
      notify(
        `Matching complete (engine ${summary.engine_version}): ${summary.matched} matched, ` +
          `${summary.matched_with_variance} with variance, ${summary.needs_review} need review, ` +
          `${summary.duplicates} duplicate, ${summary.exceptions} exceptions across ${summary.lines} lines.`,
      );
      await load();
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setRunning(false);
    }
  }, [load, notify]);

  const handleConfirm = useCallback(
    async (matchId: number, invoiceRef: string) => {
      setBusyId(matchId);
      try {
        await confirmMatch(matchId);
        notify(`Match for ${invoiceRef} confirmed.`);
        await load();
      } catch (err) {
        notify(errorMessage(err), 'error');
      } finally {
        setBusyId(null);
      }
    },
    [load, notify],
  );

  const pairs = data?.pairs ?? [];
  const summary = data?.summary;
  /** Readable reason the match records could not be loaded (null when fine). */
  const matchesError = data?.errors.matches ?? null;

  // Accurate per-status totals from the backend, not just the loaded page, so
  // the filter badges never understate the queue past the page cap.
  const counts = useMemo<Record<MatchStatus, number>>(
    () =>
      data?.statusCounts ?? {
        matched: 0,
        matched_with_variance: 0,
        duplicate: 0,
        exception: 0,
        needs_review: 0,
      },
    [data],
  );

  const filtered = activeFilter === 'all' ? pairs : pairs.filter((p) => p.status === activeFilter);
  const hasMore = pairs.length < (summary?.total ?? 0);

  return (
    <div className="flex flex-col w-full">
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
          {label}
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{description}</p>
      </div>

      <div className="flex flex-col w-full gap-space-base px-space-base pb-space-xl">
        <InvoiceToast message={toastMessage} tone={toastTone} onDismiss={dismissToast} />

        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-space-sm px-space-md py-space-xs rounded-xl bg-surface-container-low text-on-surface shadow-sm">
            <div className="flex items-center gap-space-xs min-w-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <p className="font-label-sm text-label-sm text-on-surface-variant truncate">
                {summary
                  ? `${summary.total} match records • engine ${pairs[0]?.engineVersion ?? 'deterministic'}`
                  : 'FIRA ↔ Invoice matching engine'}
              </p>
            </div>
            <div className="flex items-center gap-space-sm shrink-0">
              <button
                className="flex items-center gap-space-2xs rounded-lg bg-primary px-space-sm py-1 font-label-sm text-label-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                disabled={running}
                onClick={() => void handleRun()}
                type="button"
              >
                <span
                  className={`material-symbols-outlined text-[15px] ${running ? 'animate-spin' : ''}`}
                >
                  {running ? 'progress_activity' : 'play_arrow'}
                </span>
                <span>{running ? 'Running…' : 'Run Matching'}</span>
              </button>
              <button
                className="flex items-center gap-space-2xs text-primary font-label-sm text-label-sm font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
                disabled={loading}
                onClick={() => void load()}
                type="button"
              >
                <span className="material-symbols-outlined text-[15px]">sync</span>
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </Reveal>

        {loading ? (
          <Reveal>
            <div className="grid grid-cols-2 gap-space-sm animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-surface-container-lowest" />
              ))}
            </div>
          </Reveal>
        ) : error || matchesError ? null : summary ? (
          <Reveal delay={0.05}>
            <div className="grid grid-cols-2 gap-space-sm">
              {[
                { label: 'Match Records', value: summary.total, icon: 'receipt_long', note: 'stored' },
                { label: 'Matched', value: summary.matched, icon: 'check_circle', note: `${summary.autoMatchRate} clean rate` },
                { label: 'Needs Review', value: summary.unmatched, icon: 'help', note: 'require a decision' },
                { label: 'Exceptions', value: summary.exceptions, icon: 'warning', note: 'require review' },
              ].map((m) => (
                <div
                  key={m.label}
                  className="flex flex-col p-space-sm rounded-xl bg-surface-container-lowest shadow-sm"
                >
                  <div className="flex items-center justify-between mb-space-xs">
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                      {m.label}
                    </span>
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      {m.icon}
                    </span>
                  </div>
                  <span className="font-headline-md text-headline-md font-bold text-on-surface">
                    {m.value}
                  </span>
                  <span className="font-code-sm text-code-sm text-on-surface-variant mt-0.5">
                    {m.note}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
        ) : null}

        <Reveal delay={0.1}>
          <div className="flex items-center gap-space-xs overflow-x-auto no-scrollbar py-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                className={`filter-pill px-space-md py-1.5 rounded-full font-label-md text-label-md font-medium whitespace-nowrap transition-colors ${
                  activeFilter === f.value
                    ? 'bg-primary-container text-on-primary font-semibold'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
                onClick={() => setActiveFilter(f.value)}
                type="button"
              >
                {f.label}
                {f.value !== 'all' && ` (${counts[f.value]})`}
              </button>
            ))}
          </div>
        </Reveal>

        {loading ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
              <p className="font-body-md text-body-md">Loading matching results…</p>
            </div>
          </Reveal>
        ) : error ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm rounded-xl bg-error-container text-center">
              <span className="material-symbols-outlined text-[40px] text-error">error</span>
              <p className="font-body-md text-body-md text-on-error-container">{error}</p>
              <button
                className="rounded-lg bg-primary px-space-base py-space-xs font-label-sm text-label-sm font-semibold text-on-primary"
                onClick={() => void load()}
                type="button"
              >
                Retry
              </button>
            </div>
          </Reveal>
        ) : matchesError ? (
          <Reveal delay={0.15}>
            <WidgetError title="Match records" message={matchesError} className="py-space-sm" />
          </Reveal>
        ) : filtered.length === 0 ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px]">compare_arrows</span>
              <p className="font-body-md text-body-md">
                {pairs.length === 0
                  ? 'No match records yet. Upload a FIRA document, then run the matcher.'
                  : 'No matches with this status.'}
              </p>
            </div>
          </Reveal>
        ) : (
          <Reveal delay={0.15}>
            <div className="flex flex-col rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden">
              <div className="grid grid-cols-[1.4fr_1.2fr_auto_auto_auto] gap-space-sm px-space-md py-space-sm bg-surface-container border-b border-outline-variant">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
                  Invoice
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
                  FIRA Line
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold text-right">
                  Invoice Amount
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold text-right">
                  Confidence
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold text-center">
                  Status
                </span>
              </div>

              {filtered.map((pair) => (
                <div
                  key={pair.id}
                  className="grid grid-cols-[1.4fr_1.2fr_auto_auto_auto] gap-space-sm px-space-md py-space-sm border-b border-outline-variant last:border-b-0 hover:bg-surface-container transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-label-md text-label-md font-semibold text-on-surface truncate">
                      {pair.invoiceRef}
                    </p>
                    <p className="font-code-sm text-code-sm text-on-surface-variant truncate">
                      {pair.client}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-label-md text-label-md text-on-surface truncate">
                      {pair.firaRef}
                    </p>
                    <p className="font-code-sm text-code-sm text-on-surface-variant truncate">
                      {pair.matchType ?? '—'}
                      {pair.isSynthetic && ' • simulated'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-label-md text-label-md font-semibold text-on-surface whitespace-nowrap">
                      {pair.invoiceAmount}
                    </p>
                    <p className="font-code-sm text-code-sm text-on-surface-variant whitespace-nowrap">
                      {pair.currency}
                    </p>
                    {pair.variance && (
                      <p className="font-code-sm text-code-sm text-error whitespace-nowrap">
                        {pair.variance}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-label-md text-label-md text-on-surface whitespace-nowrap">
                      {pair.confidence}
                    </p>
                    <p className="font-code-sm text-code-sm text-on-surface-variant whitespace-nowrap">
                      {humanDateTime(pair.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-1">
                    {statusBadge(pair.status)}
                    {pair.confirmed ? (
                      <span className="font-code-sm text-code-sm text-on-surface-variant whitespace-nowrap">
                        confirmed
                      </span>
                    ) : pair.confirmable ? (
                      <button
                        className="font-code-sm text-code-sm font-semibold text-primary hover:opacity-80 disabled:opacity-50"
                        disabled={busyId === pair.id}
                        onClick={() => void handleConfirm(pair.id, pair.invoiceRef)}
                        type="button"
                      >
                        {busyId === pair.id ? 'confirming…' : 'confirm'}
                      </button>
                    ) : (
                      <span className="font-code-sm text-code-sm text-on-surface-variant whitespace-nowrap">
                        review
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        )}

        {!loading && !error && !matchesError && hasMore && (
          <Reveal delay={0.2}>
            <div className="flex flex-wrap items-center justify-center gap-space-sm px-space-md py-space-sm rounded-xl bg-surface-container-low">
              <span className="font-code-sm text-code-sm text-on-surface-variant">
                Showing {pairs.length} of {summary?.total ?? 0} match records, newest first
              </span>
              <button
                className="rounded-lg bg-primary px-space-sm py-1 font-label-sm text-label-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                type="button"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}

export default MatchingCenter;
