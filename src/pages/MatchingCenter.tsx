import { useEffect, useState } from 'react';
import Reveal from '../components/Reveal';
import { getNavItem } from '../config/navigation';
import {
  fetchMatchingResults,
  type MatchingResultsResponse,
  type MatchStatus,
} from '../services/matchingService';

const { label, description } = getNavItem('/matching');

/** Badge colour by match status */
function statusBadge(status: MatchStatus) {
  const map: Record<MatchStatus, { bg: string; text: string; label: string }> = {
    matched:   { bg: 'bg-emerald-50',  text: 'text-emerald-800', label: 'Matched' },
    partial:   { bg: 'bg-amber-50',    text: 'text-amber-800',   label: 'Partial' },
    unmatched: { bg: 'bg-error-container', text: 'text-on-error-container', label: 'Unmatched' },
    exception: { bg: 'bg-surface-container-high', text: 'text-on-surface-variant', label: 'Exception' },
  };
  const s = map[status] ?? map.exception;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function MatchingCenter() {
  const [data, setData] = useState<MatchingResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  useEffect(() => {
    fetchMatchingResults()
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const pairs = data?.pairs ?? [];
  const summary = data?.summary;

  const filtered =
    activeFilter === 'all' ? pairs : pairs.filter((p) => p.status === activeFilter);

  return (
    <div className="flex flex-col w-full">
      {/* Page Header */}
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
          {label}
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
          {description}
        </p>
      </div>

      <div className="flex flex-col w-full gap-space-base px-space-base pb-space-xl">
        {/* Live engine banner */}
        <Reveal>
          <div className="flex items-center justify-between px-space-md py-space-xs rounded-xl bg-surface-container-low text-on-surface shadow-sm">
            <div className="flex items-center gap-space-xs min-w-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <p className="font-label-sm text-label-sm text-on-surface-variant truncate">
                FIRA ↔ Invoice Matching Engine Active
              </p>
            </div>
            <button
              className="flex items-center gap-space-2xs text-primary font-label-sm text-label-sm font-semibold shrink-0 hover:opacity-80 transition-opacity"
              type="button"
            >
              <span className="material-symbols-outlined text-[15px]">sync</span>
              <span>Refresh</span>
            </button>
          </div>
        </Reveal>

        {/* Summary Metrics */}
        {loading ? (
          <Reveal>
            <div className="grid grid-cols-2 gap-space-sm animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-surface-container-lowest" />
              ))}
            </div>
          </Reveal>
        ) : error ? null : summary ? (
          <Reveal delay={0.05}>
            <div className="grid grid-cols-2 gap-space-sm">
              {[
                { label: 'Total Invoices', value: summary.totalInvoices, icon: 'receipt_long', note: 'this period' },
                { label: 'Auto-Matched', value: summary.matched, icon: 'check_circle', note: `${summary.autoMatchRate} match rate` },
                { label: 'Unmatched', value: summary.unmatched, icon: 'link_off', note: 'need FIRA' },
                { label: 'Exceptions', value: summary.exceptions, icon: 'warning', note: 'require review' },
              ].map((m) => (
                <div key={m.label} className="flex flex-col p-space-sm rounded-xl bg-surface-container-lowest shadow-sm">
                  <div className="flex items-center justify-between mb-space-xs">
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">{m.label}</span>
                    <span className="material-symbols-outlined text-[16px] text-primary">{m.icon}</span>
                  </div>
                  <span className="font-headline-md text-headline-md font-bold text-on-surface">{m.value}</span>
                  <span className="font-code-sm text-code-sm text-on-surface-variant mt-0.5">{m.note}</span>
                </div>
              ))}
            </div>
          </Reveal>
        ) : null}

        {/* Filter Pills */}
        <Reveal delay={0.1}>
          <div className="flex items-center gap-space-xs overflow-x-auto no-scrollbar py-1">
            {(['all', 'matched', 'partial', 'unmatched', 'exception'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFilter(f)}
                className={`filter-pill px-space-md py-1.5 rounded-full font-label-md text-label-md font-medium whitespace-nowrap transition-colors capitalize ${
                  activeFilter === f
                    ? 'bg-primary-container text-on-primary font-semibold'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {f === 'all' ? 'All Pairs' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Content: loading / error / empty / table */}
        {loading ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
              <p className="font-body-md text-body-md">Loading matching results…</p>
            </div>
          </Reveal>
        ) : error ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-error">
              <span className="material-symbols-outlined text-[40px]">error</span>
              <p className="font-body-md text-body-md">Error: {error}</p>
            </div>
          </Reveal>
        ) : filtered.length === 0 ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px]">compare_arrows</span>
              <p className="font-body-md text-body-md">No matching pairs found.</p>
            </div>
          </Reveal>
        ) : (
          <Reveal delay={0.15}>
            <div className="flex flex-col rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-space-sm px-space-md py-space-sm bg-surface-container border-b border-outline-variant">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">Invoice</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">FIRA Ref</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold text-right">Amount</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold text-right">Received</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold text-center">Status</span>
              </div>

              {filtered.map((pair) => (
                <div
                  key={pair.id}
                  className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-space-sm px-space-md py-space-sm border-b border-outline-variant last:border-b-0 hover:bg-surface-container transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-label-md text-label-md font-semibold text-on-surface truncate">{pair.invoiceRef}</p>
                    <p className="font-code-sm text-code-sm text-on-surface-variant truncate">{pair.client}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-label-md text-label-md text-on-surface truncate">{pair.firaRef}</p>
                    {pair.bank && (
                      <p className="font-code-sm text-code-sm text-on-surface-variant truncate">{pair.bank}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-label-md text-label-md font-semibold text-on-surface whitespace-nowrap">{pair.invoiceAmount}</p>
                    <p className="font-code-sm text-code-sm text-on-surface-variant whitespace-nowrap">{pair.currency}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-label-md text-label-md text-on-surface whitespace-nowrap">{pair.receivedAmount}</p>
                    {pair.variance && (
                      <p className="font-code-sm text-code-sm text-error whitespace-nowrap">{pair.variance}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-center">
                    {statusBadge(pair.status)}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}

export default MatchingCenter;
