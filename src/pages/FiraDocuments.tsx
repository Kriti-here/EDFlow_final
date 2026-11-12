import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Reveal from '../components/Reveal';
import {
  FiraActionBar,
  FiraDocumentTable,
  FiraInspectModal,
  FiraMetricsCard,
  FiraUploadCard,
  FiraValidationCard,
} from '../components/fira';
import type { FilterTab } from '../components/fira/FiraActionBar';
import { InvoiceToast } from '../components/invoices';
import MaterialIcon from '../components/landing/MaterialIcon';
import { getNavItem } from '../config/navigation';
import { errorMessage } from '../services/api';
import { fetchFiraDocuments, type FiraDocumentRecord } from '../services/firaService';

const { description } = getNavItem('/fira');

type StatusFilter = 'all' | 'verified' | 'needs_review' | 'failed';

const FILTER_VALUES: Record<string, StatusFilter> = {
  All: 'all',
  Verified: 'verified',
  'Needs Review': 'needs_review',
  Failed: 'failed',
};

/** Banks seen in the stored statements, most frequent first. */
function bankNodes(documents: FiraDocumentRecord[], limit = 3) {
  const counts = new Map<string, number>();
  for (const document of documents) {
    const name = document.bank_name?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, statementCount]) => ({ name, statementCount }));
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-space-xs rounded-xl bg-surface-container-lowest p-space-xl shadow-sm">
      <MaterialIcon name="progress_activity" className="animate-spin text-[28px] text-primary" />
      <span className="font-body-sm text-body-sm text-on-surface-variant">
        Loading FIRA documents…
      </span>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-space-sm rounded-xl bg-error-container p-space-xl text-center shadow-sm">
      <MaterialIcon name="cloud_off" className="text-[28px] text-error" />
      <p className="max-w-lg font-body-sm text-body-sm text-on-error-container">{message}</p>
      <button
        className="rounded-lg bg-primary px-space-base py-space-xs font-label-sm text-label-sm font-semibold text-on-primary"
        onClick={onRetry}
        type="button"
      >
        Retry
      </button>
    </div>
  );
}

function FiraDocuments() {
  const [documents, setDocuments] = useState<FiraDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [inspectId, setInspectId] = useState<number | null>(null);
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
    setLoadError(null);
    try {
      setDocuments(await fetchFiraDocuments());
    } catch (err) {
      setDocuments([]);
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const verified = documents.filter((d) => d.verification_status === 'verified').length;
    const needsReview = documents.filter((d) => d.verification_status === 'needs_review').length;
    const failed = documents.filter((d) => d.verification_status === 'failed').length;
    const lines = documents.reduce((total, d) => total + (d.line_count ?? 0), 0);
    const share = documents.length > 0 ? (verified / documents.length) * 100 : 0;
    return { verified, needsReview, failed, lines, share };
  }, [documents]);

  const tabs: FilterTab[] = useMemo(
    () => [
      { label: 'All', count: documents.length, active: filter === 'all', variant: 'primary' },
      { label: 'Verified', count: metrics.verified, active: filter === 'verified' },
      { label: 'Needs Review', count: metrics.needsReview, active: filter === 'needs_review' },
      {
        label: 'Failed',
        count: metrics.failed,
        active: filter === 'failed',
        variant: 'error' as const,
      },
    ],
    [documents.length, filter, metrics.failed, metrics.needsReview, metrics.verified],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter((document) => {
      if (filter !== 'all' && document.verification_status !== filter) return false;
      if (!needle) return true;
      return [
        document.fira_reference,
        document.file_name,
        document.bank_name,
        document.ad_code,
        document.source,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [documents, filter, query]);

  const banks = useMemo(() => bankNodes(documents), [documents]);

  const handleUploaded = useCallback(
    (document: FiraDocumentRecord) => {
      setDocuments((current) => [document, ...current.filter((d) => d.id !== document.id)]);
      notify(
        `${document.file_name} stored with status ${document.verification_status} ` +
          `(${document.line_count ?? 0} lines extracted).`,
      );
      void load();
    },
    [load, notify],
  );

  return (
    <div className="flex flex-col w-full">
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
          Fira Documents
        </h1>
        <p className="mt-1 max-w-3xl font-body-md text-body-md text-on-surface-variant">
          {description}
        </p>
      </div>

      <div className="flex flex-col w-full gap-space-base px-space-base pb-space-xl">
        <InvoiceToast message={toastMessage} tone={toastTone} onDismiss={dismissToast} />

        <Reveal>
          <div className="flex items-center justify-between px-space-md py-space-xs rounded-xl bg-surface-container-low text-on-surface shadow-sm">
            <div className="flex items-center gap-space-xs min-w-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-tertiary" />
              </span>
              <p className="font-label-sm text-label-sm text-on-surface-variant truncate">
                {documents.length} FIRA documents stored • {metrics.lines} statement lines extracted
              </p>
            </div>
            <button
              className="flex items-center gap-space-2xs text-primary font-label-sm text-label-sm font-semibold shrink-0 hover:opacity-80 transition-opacity disabled:opacity-50"
              disabled={loading}
              onClick={() => void load()}
              type="button"
            >
              <MaterialIcon
                name={loading ? 'progress_activity' : 'sync'}
                className={`text-[15px] ${loading ? 'animate-spin' : ''}`}
              />
              <span>Refresh</span>
            </button>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="grid grid-cols-2 gap-space-sm">
            <FiraMetricsCard
              icon="receipt_long"
              label="FIRA DOCUMENTS"
              subtitle="Stored in the database"
              value={String(documents.length)}
            />
            <FiraMetricsCard
              icon="format_list_numbered"
              label="LINES EXTRACTED"
              subtitle="Across all statements"
              value={String(metrics.lines)}
            />
            <FiraMetricsCard
              icon="check_circle"
              label="VERIFIED"
              progress={metrics.share}
              subtitle={`/ ${documents.length} documents`}
              value={String(metrics.verified)}
            />
            <FiraMetricsCard
              icon="priority_high"
              label="FLAGGED"
              subtitle={`${metrics.needsReview} review · ${metrics.failed} failed`}
              value={String(metrics.needsReview + metrics.failed)}
            />
          </div>
        </Reveal>

        {banks.length > 0 && (
          <Reveal delay={0.2}>
            <FiraValidationCard banks={banks} status="Statements ingested" title="Statement Sources" />
          </Reveal>
        )}

        <Reveal delay={0.3}>
          <FiraUploadCard onUploaded={handleUploaded} />
        </Reveal>

        <Reveal delay={0.4}>
          <FiraActionBar
            onSelect={(label) => setFilter(FILTER_VALUES[label] ?? 'all')}
            tabs={tabs}
          />
        </Reveal>

        <Reveal delay={0.5}>
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
              search
            </span>
            <input
              className="w-full h-11 pl-11 pr-space-md rounded-xl bg-surface-container-lowest text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant shadow-sm focus:outline-none focus:bg-surface-container-lowest"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by FIRA Ref, bank, AD code, or file name…"
              type="text"
              value={query}
            />
          </div>
        </Reveal>

        {loading ? (
          <Reveal delay={0.6}>
            <LoadingState />
          </Reveal>
        ) : loadError ? (
          <Reveal delay={0.6}>
            <ErrorState message={loadError} onRetry={() => void load()} />
          </Reveal>
        ) : documents.length === 0 ? (
          <Reveal delay={0.6}>
            <div className="flex flex-col items-center justify-center rounded-xl bg-surface-container-lowest p-space-xl text-center shadow-sm">
              <div className="mb-space-sm flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
                <MaterialIcon name="description" className="text-[28px]" />
              </div>
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                No FIRA documents yet
              </h3>
              <p className="mt-1 max-w-sm font-body-sm text-body-sm text-on-surface-variant">
                Upload a weekly bank FIRA certificate or Swift MT103 advice above to extract the
                inward remittance lines.
              </p>
            </div>
          </Reveal>
        ) : visible.length === 0 ? (
          <Reveal delay={0.6}>
            <p className="rounded-xl bg-surface-container-lowest p-space-xl text-center font-body-sm text-body-sm text-on-surface-variant shadow-sm">
              No documents match the current filter or search.
            </p>
          </Reveal>
        ) : (
          <Reveal delay={0.6}>
            <FiraDocumentTable documents={visible} onInspect={(d) => setInspectId(d.id)} />
          </Reveal>
        )}
      </div>

      <FiraInspectModal documentId={inspectId} onClose={() => setInspectId(null)} />
    </div>
  );
}

export default FiraDocuments;
