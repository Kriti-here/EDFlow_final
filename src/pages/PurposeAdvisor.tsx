import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Reveal from '../components/Reveal';
import WidgetError from '../components/WidgetError';
import InvoiceToast from '../components/invoices/InvoiceToast';
import {
  PurposeRecommendationCard,
  PurposeCodeExplorer,
  SuggestedPurposePanel,
} from '../components/purpose';
import { getNavItem } from '../config/navigation';
import { errorMessage } from '../services/api';
import {
  acceptRecommendation,
  fetchPurposeQueue,
  fetchPurposeReferences,
  rejectRecommendation,
  runPurposeAdviser,
  type PurposeQueueResponse,
  type PurposeReferencesResponse,
} from '../services/purposeService';
import type { Metric } from '../types/purpose';

const { label, description } = getNavItem('/purpose');

/** Whole class strings: Tailwind cannot see classes built from templates. */
const METRIC_COLORS: Record<NonNullable<Metric['variant']>, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary',
  error: 'text-error',
};

type ToastTone = 'success' | 'error';

function PurposeAdvisor() {
  const [queue, setQueue] = useState<PurposeQueueResponse | null>(null);
  const [references, setReferences] = useState<PurposeReferencesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [referencesError, setReferencesError] = useState<string | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState<boolean>(false);
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
    // The code catalogue is a secondary panel: settle it on its own so a rules
    // failure can never hide the queue (and is reported next to the catalogue).
    const [queueResult, refsResult] = await Promise.allSettled([
      fetchPurposeQueue(),
      fetchPurposeReferences(),
    ]);
    if (queueResult.status === 'fulfilled') {
      setQueue(queueResult.value);
    } else {
      setQueue(null);
      setLoadError(errorMessage(queueResult.reason));
    }
    if (refsResult.status === 'fulfilled') {
      setReferences(refsResult.value);
      setReferencesError(null);
    } else {
      setReferencesError(errorMessage(refsResult.reason));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const queueItems = queue?.queueItems ?? [];
  const primaryCase = queue?.primaryCase ?? null;

  const meanConfidence = useMemo(() => {
    if (queueItems.length === 0) return null;
    const values = queueItems
      .map((item) => Number.parseFloat(item.aiFit))
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) return null;
    return `${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)}%`;
  }, [queueItems]);

  const handleAccept = useCallback(
    async (recommendationId: string) => {
      setBusyId(recommendationId);
      try {
        const decision = await acceptRecommendation(Number(recommendationId));
        notify(`Code ${decision.code} committed to the invoice (audit entry recorded).`);
        await load();
      } catch (err) {
        notify(errorMessage(err), 'error');
      } finally {
        setBusyId(null);
      }
    },
    [load, notify],
  );

  const handleReject = useCallback(
    async (recommendationId: string) => {
      setBusyId(recommendationId);
      try {
        const decision = await rejectRecommendation(Number(recommendationId));
        notify(`Proposal ${decision.code} rejected; the invoice was not changed.`);
        await load();
      } catch (err) {
        notify(errorMessage(err), 'error');
      } finally {
        setBusyId(null);
      }
    },
    [load, notify],
  );

  const handleBatchAccept = useCallback(
    async (recommendationIds: string[]) => {
      if (recommendationIds.length === 0) return;
      setBatchBusy(true);
      const failures: string[] = [];
      for (const id of recommendationIds) {
        try {
          await acceptRecommendation(Number(id));
        } catch (err) {
          failures.push(`#${id}: ${errorMessage(err)}`);
        }
      }
      setBatchBusy(false);
      if (failures.length > 0) {
        notify(`${failures.length} proposal(s) failed — ${failures[0]}`, 'error');
      } else {
        notify(`${recommendationIds.length} proposal(s) accepted and committed.`);
      }
      await load();
    },
    [load, notify],
  );

  const handleRunAdviser = useCallback(async () => {
    setRunning(true);
    try {
      await runPurposeAdviser();
      await load();
      notify('Purpose adviser re-run over the stored invoices.');
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setRunning(false);
    }
  }, [load, notify]);

  return (
    <div className="flex flex-col w-full">
      {/* Page Header */}
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
          {label}
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{description}</p>
      </div>

      <div className="flex flex-col gap-space-lg px-space-base py-space-md">
        {/* Adviser header */}
        <Reveal>
          <section className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between gap-space-sm flex-wrap">
              <div className="flex items-center gap-space-xs">
                <span
                  className={`flex h-2 w-2 rounded-full ${
                    queueItems.length > 0 ? 'bg-primary-container animate-pulse' : 'bg-tertiary'
                  }`}
                />
                <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider">
                  Deterministic purpose adviser
                </span>
              </div>
              <div className="flex items-center gap-space-xs">
                <div className="flex items-center gap-1 px-space-sm py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-code-sm text-code-sm">
                  <span className="material-symbols-outlined text-[14px] text-tertiary">lock</span>
                  <span>{references ? `Rules ${references.version}` : 'rules offline'}</span>
                </div>
                <button
                  className="flex items-center gap-1 px-space-sm py-1 rounded-full bg-surface-container text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors font-label-sm text-label-sm disabled:opacity-60"
                  disabled={running}
                  onClick={() => void handleRunAdviser()}
                  type="button"
                >
                  <span className={`material-symbols-outlined text-[16px] ${running ? 'animate-spin' : ''}`}>
                    sync
                  </span>
                  <span>{running ? 'Running…' : 'Run Adviser'}</span>
                </button>
              </div>
            </div>

            {/* Rules strip */}
            <div className="flex items-center justify-between gap-space-sm px-space-base py-space-sm rounded-xl bg-surface-container-low shadow-sm">
              <div className="flex items-center gap-space-xs text-tertiary min-w-0">
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
                <span className="font-label-md text-label-md font-semibold text-on-surface truncate">
                  {references ? references.sourcePath : 'rules/india_export.yaml'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm shrink-0">
                <span>{meanConfidence ? 'Mean proposal confidence:' : 'No proposals loaded'}</span>
                {meanConfidence && (
                  <span className="font-code-sm text-code-sm text-primary font-bold">
                    {meanConfidence}
                  </span>
                )}
              </div>
            </div>

            {/* Summary Metric Counters */}
            {queue &&
              (queue.errors.summary ? (
                <WidgetError
                  title="Adviser metrics"
                  message={queue.errors.summary}
                  className="mt-space-2xs"
                />
              ) : (
                <div className="grid grid-cols-2 gap-space-xs pt-space-2xs">
                  {queue.metrics.map((metric, index) => (
                    <Reveal key={metric.label} delay={index * 0.05}>
                      <div className="p-space-sm rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between text-on-surface-variant">
                          <span className="font-label-sm text-label-sm">{metric.label}</span>
                          <span className="material-symbols-outlined text-[16px]">
                            {metric.icon}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-space-xs mt-space-xs">
                          <span
                            className={`font-headline-md text-headline-md font-bold ${
                              metric.variant ? METRIC_COLORS[metric.variant] : 'text-on-surface'
                            }`}
                          >
                            {metric.value}
                          </span>
                          <span className="font-body-sm text-body-sm text-on-surface-variant">
                            {metric.subtitle}
                          </span>
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              ))}
          </section>
        </Reveal>

        {/* Toast */}
        {toast && (
          <InvoiceToast message={toast.message} onDismiss={() => setToast(null)} tone={toast.tone} />
        )}

        {/* Loading / error / empty / data */}
        {loading && !queue ? (
          <Reveal delay={0.2}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
              <p className="font-body-md text-body-md">Loading purpose queue…</p>
            </div>
          </Reveal>
        ) : loadError ? (
          <Reveal delay={0.2}>
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
        ) : queue?.errors.recommendations && queueItems.length === 0 && !primaryCase ? (
          <Reveal delay={0.2}>
            <WidgetError title="Purpose queue" message={queue.errors.recommendations} />
          </Reveal>
        ) : queueItems.length === 0 && !primaryCase ? (
          <Reveal delay={0.2}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px]">task_alt</span>
              <p className="font-body-md text-body-md">No purpose codes pending review.</p>
              <button
                className="mt-space-xs h-10 px-space-base rounded-xl bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold hover:bg-surface-container transition-colors disabled:opacity-60"
                disabled={running}
                onClick={() => void handleRunAdviser()}
                type="button"
              >
                {running ? 'Running…' : 'Run the adviser over stored invoices'}
              </button>
            </div>
          </Reveal>
        ) : (
          <>
            {queue?.errors.recommendations && (
              <Reveal delay={0.2}>
                <WidgetError
                  title="Purpose queue is incomplete"
                  message={queue.errors.recommendations}
                />
              </Reveal>
            )}
            {primaryCase && (
              <Reveal delay={0.2}>
                <section className="flex flex-col gap-space-sm">
                  <div className="flex items-center justify-between gap-space-sm flex-wrap">
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-primary text-[20px]">
                        troubleshoot
                      </span>
                      <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                        Highest-confidence proposal
                      </span>
                    </div>
                    <span className="px-space-sm py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-bold">
                      {primaryCase.aiBand ?? 'band n/a'} · {primaryCase.aiStatus ?? 'proposed'}
                    </span>
                  </div>

                  <PurposeRecommendationCard
                    busy={busyId === primaryCase.id}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    purposeCase={primaryCase}
                  />
                </section>
              </Reveal>
            )}

            {queueItems.length > 0 && (
              <Reveal delay={0.3}>
                <SuggestedPurposePanel
                  batchBusy={batchBusy}
                  busyId={busyId}
                  onAccept={handleAccept}
                  onBatchAccept={(ids) => void handleBatchAccept(ids)}
                  onReject={handleReject}
                  queueItems={queueItems}
                />
              </Reveal>
            )}
          </>
        )}

        {/* Purpose Code Catalogue */}
        {references ? (
          <PurposeCodeExplorer
            lastUpdated={references.lastUpdated}
            references={references.references}
            sourcePath={references.sourcePath}
            verified={references.verified}
            version={references.version}
          />
        ) : referencesError ? (
          <WidgetError title="Purpose code catalogue" message={referencesError} />
        ) : null}
      </div>
    </div>
  );
}

export default PurposeAdvisor;
