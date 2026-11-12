import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Reveal from '../components/Reveal';
import WidgetError from '../components/WidgetError';
import InvoiceToast from '../components/invoices/InvoiceToast';
import {
  ExceptionsMetrics,
  ExceptionFilters,
  ExceptionRow,
  ExceptionsQueueCard,
  ResolutionPanel,
} from '../components/exceptions';
import type { ExceptionActionKind } from '../components/exceptions/ExceptionRow';
import { getNavItem } from '../config/navigation';
import { errorMessage } from '../services/api';
import {
  acknowledgeException,
  categoryLabel,
  deriveExceptions,
  dismissException,
  fetchExceptions,
  resolveException,
  type ExceptionsResponse,
} from '../services/exceptionsService';
import type {
  ExceptionItem,
  ExceptionSection,
  ExceptionSeverity,
  FilterPill,
} from '../types/exceptions';

const { description } = getNavItem('/exceptions');

/** Presentation for each severity bucket the queue is grouped into. */
const SECTION_META: Record<ExceptionSeverity, Omit<ExceptionSection, 'count'>> = {
  critical: { id: 'critical', title: 'Critical Exceptions', severity: 'critical', subtitle: 'resolve first' },
  high: { id: 'high', title: 'High Priority Exceptions', severity: 'high', subtitle: 'needs review' },
  medium: { id: 'medium', title: 'Medium Priority Exceptions', severity: 'medium', subtitle: 'in queue' },
  low: { id: 'low', title: 'Low Priority Exceptions', severity: 'low', subtitle: 'informational' },
};

const SEVERITY_ORDER: ExceptionSeverity[] = ['critical', 'high', 'medium', 'low'];

const PAST_TENSE: Record<string, string> = {
  acknowledge: 'acknowledged',
  resolve: 'resolved',
  dismiss: 'dismissed',
};

type ToastTone = 'success' | 'error';

/** Does the exception match the free-text search box? */
function matchesQuery(exception: ExceptionItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [exception.code, exception.invoiceRef, exception.title, exception.client]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

function ExceptionsHub() {
  const [data, setData] = useState<ExceptionsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');

  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await fetchExceptions());
    } catch (err) {
      setData(null);
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];
  /** Readable reason each section failed to load (null when fine). */
  const queueError = data?.errors.queue ?? null;
  const summaryError = data?.errors.summary ?? null;
  const resolvedError = data?.errors.resolved ?? null;

  const filters = useMemo<FilterPill[]>(() => {
    const counts = data?.categoryCounts ?? {};
    const pills: FilterPill[] = [
      { label: 'All', count: items.length, category: 'all', active: activeCategory === 'all' },
    ];
    for (const [category, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      pills.push({
        label: categoryLabel(category),
        count,
        category,
        active: activeCategory === category,
      });
    }
    return pills;
  }, [data, items.length, activeCategory]);

  const clients = useMemo(
    () => [...new Set(items.map((item) => item.client).filter(Boolean))].sort(),
    [items],
  );

  const visible = useMemo(
    () =>
      items.filter((item) => {
        if (activeCategory !== 'all' && !item.categories.includes(activeCategory)) return false;
        if (severityFilter !== 'all' && item.severity !== severityFilter) return false;
        if (clientFilter !== 'all' && item.client !== clientFilter) return false;
        return matchesQuery(item, query);
      }),
    [items, activeCategory, severityFilter, clientFilter, query],
  );

  const sections = useMemo<ExceptionSection[]>(
    () =>
      SEVERITY_ORDER.map((severity) => ({
        ...SECTION_META[severity],
        count: visible.filter((item) => item.severity === severity).length,
      })).filter((section) => section.count > 0),
    [visible],
  );

  const clearFilters = useCallback(() => {
    setActiveCategory('all');
    setSeverityFilter('all');
    setClientFilter('all');
    setQuery('');
  }, []);

  /** POST /exceptions/derive, then reload the queue from the database. */
  const handleRerun = useCallback(async () => {
    setSyncing(true);
    try {
      await deriveExceptions();
      await load();
      notify('Exception detection re-run from the stored FIRA lines and ledger.');
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setSyncing(false);
    }
  }, [load, notify]);

  /** Acknowledge / resolve / dismiss the row's chosen action. */
  const handleAction = useCallback(
    async (exception: ExceptionItem, action: ExceptionActionKind) => {
      const id = Number(exception.id);
      const kind =
        action === 'primary'
          ? exception.actions.primary.onClick
          : exception.actions.secondary?.onClick;
      if (!kind) return;

      setBusyId(exception.id);
      try {
        if (kind === 'acknowledge') await acknowledgeException(id);
        else if (kind === 'resolve') await resolveException(id);
        else if (kind === 'dismiss') await dismissException(id);
        else throw new Error(`Unsupported action "${kind}" on ${exception.code}.`);
        notify(`${exception.code} ${PAST_TENSE[kind] ?? 'updated'}.`);
        await load();
      } catch (err) {
        notify(errorMessage(err), 'error');
      } finally {
        setBusyId(null);
      }
    },
    [load, notify],
  );

  return (
    <div className="flex flex-col w-full">
      {/* Page Header */}
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
          Exceptions Hub
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{description}</p>
      </div>

      <div className="flex flex-col w-full px-space-base pb-space-xl gap-space-base">
        {/* Queue banner */}
        <Reveal>
          <div className="flex items-center justify-between gap-space-sm flex-wrap">
            <div className="flex items-center gap-space-xs">
              <span
                className={`flex h-2 w-2 rounded-full ${
                  items.length > 0 ? 'bg-error animate-ping' : 'bg-tertiary'
                }`}
              />
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                {items.length > 0
                  ? `${items.length} exception${items.length === 1 ? '' : 's'} awaiting review`
                  : 'Exception queue clear'}
              </span>
            </div>
            <button
              className="flex items-center gap-space-2xs text-on-surface-variant hover:text-primary transition-colors py-1 px-2 rounded-xl hover:bg-surface-container disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={syncing}
              onClick={() => void handleRerun()}
              type="button"
            >
              <span className={`material-symbols-outlined text-[16px] ${syncing ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span className="font-label-sm text-label-sm">
                {syncing ? 'Re-running…' : 'Re-run Detection'}
              </span>
            </button>
          </div>
        </Reveal>

        {/* Toast */}
        {toast && (
          <InvoiceToast
            message={toast.message}
            onDismiss={() => setToast(null)}
            tone={toast.tone}
          />
        )}

        {/* Top KPI Metrics */}
        {data &&
          (summaryError ? (
            <Reveal delay={0.05}>
              <WidgetError title="Exception metrics" message={summaryError} />
            </Reveal>
          ) : (
            <Reveal delay={0.05}>
              <ExceptionsMetrics metrics={data.kpis} />
            </Reveal>
          ))}

        {/* Search & Filters */}
        <Reveal delay={0.1}>
          <ExceptionFilters
            activeCategory={activeCategory}
            client={clientFilter}
            clients={clients}
            filters={filters}
            onClientChange={setClientFilter}
            onFilterChange={setActiveCategory}
            onQueryChange={setQuery}
            onSeverityChange={setSeverityFilter}
            query={query}
            severity={severityFilter}
          />
        </Reveal>

        {/* Loading / Error / Empty / Data states */}
        {loading && !data ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
              <p className="font-body-md text-body-md">Loading exceptions…</p>
            </div>
          </Reveal>
        ) : loadError ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-error text-center">
              <span className="material-symbols-outlined text-[40px]">error</span>
              <p className="font-body-md text-body-md max-w-xl break-words">{loadError}</p>
              <button
                className="mt-space-xs h-10 px-space-base rounded-xl bg-primary-container text-on-primary font-label-md text-label-md font-semibold hover:bg-primary transition-all"
                onClick={() => void load()}
                type="button"
              >
                Retry
              </button>
            </div>
          </Reveal>
        ) : queueError && items.length === 0 ? (
          <Reveal delay={0.15}>
            <WidgetError title="Exception queue" message={queueError} />
          </Reveal>
        ) : items.length === 0 ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px]">check_circle</span>
              <p className="font-body-md text-body-md">
                No open exceptions. Upload a FIRA document and run the matcher to populate this queue.
              </p>
            </div>
          </Reveal>
        ) : visible.length === 0 ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px]">filter_alt_off</span>
              <p className="font-body-md text-body-md">No exceptions match the current filters.</p>
              <button
                className="mt-space-xs h-10 px-space-base rounded-xl bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold hover:bg-surface-container transition-colors"
                onClick={clearFilters}
                type="button"
              >
                Clear filters
              </button>
            </div>
          </Reveal>
        ) : (
          <>
            {queueError && (
              <Reveal delay={0.15}>
                <WidgetError title="Exception queue is incomplete" message={queueError} />
              </Reveal>
            )}
            {sections.map((section, index) => (
              <Reveal delay={0.15 + index * 0.05} key={section.id}>
                <ExceptionsQueueCard section={section}>
                  {visible
                    .filter((item) => item.severity === section.severity)
                    .map((exception) => (
                      <div className={busyId === exception.id ? 'opacity-60 pointer-events-none' : ''} key={exception.id}>
                        <ExceptionRow exception={exception} onAction={handleAction} />
                      </div>
                    ))}
                </ExceptionsQueueCard>
              </Reveal>
            ))}
          </>
        )}

        {/* Resolved Today Section */}
        <Reveal delay={0.3}>
          {resolvedError ? (
            <WidgetError title="Resolved today" message={resolvedError} />
          ) : (
            <ResolutionPanel
              resolvedExceptions={data?.resolvedToday ?? []}
              totalResolved={data?.totalResolved ?? 0}
            />
          )}
        </Reveal>
      </div>
    </div>
  );
}

export default ExceptionsHub;
