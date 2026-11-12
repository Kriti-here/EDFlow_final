import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Reveal from '../components/Reveal';
import WidgetError from '../components/WidgetError';
import InvoiceToast from '../components/invoices/InvoiceToast';
import {
  EDFReadinessCard,
  EDFPackTable,
  DispatchCard,
} from '../components/edf';
import { errorMessage } from '../services/api';
import {
  approveEDFPack,
  downloadEDFPack,
  fetchEDFPacks,
  generateEDFPack,
  revokeEDFPack,
  validateEDFPack,
  type EDFPacksResponse,
} from '../services/edfService';
import type {
  EDFPack,
  EDFPackExportFormat,
  EDFPackStatus,
  EdfPackAction,
} from '../types/edf';
import { getNavItem } from '../config/navigation';

/** Whole class strings only — Tailwind cannot see template-built class names. */
const METRIC_STYLES: Record<string, { badge: string; icon: string }> = {
  ready: { badge: 'bg-[#D1FAE5] text-[#065F46]', icon: 'text-[#10B981]' },
  draft: { badge: 'bg-surface-container-high text-primary', icon: 'text-primary-container' },
  blocked: { badge: 'bg-error-container text-on-error-container', icon: 'text-error' },
  exported: { badge: 'bg-surface-container-high text-secondary', icon: 'text-secondary' },
};

const STATUS_LABEL: Record<EDFPackStatus, string> = {
  ready: 'Approved',
  draft: 'Drafting',
  blocked: 'Blocked',
  exported: 'Exported',
  void: 'Revoked',
};

/** `YYYY-MM` for the browser's current month, used as the generate default. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function EDFPacks() {
  const { description } = getNavItem('/edf-packs');

  const [data, setData] = useState<EDFPacksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [month, setMonth] = useState<string>(currentMonth);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
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
      setData(await fetchEDFPacks());
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

  const packs = data?.packs ?? [];
  const latest = data?.latest ?? null;
  const activeCompilation = data?.activeCompilation ?? null;
  /** Readable reason the pack board could not be loaded (null when fine). */
  const packsError = data?.errors.packs ?? null;

  const filterTabs = useMemo(() => {
    const count = (status: EDFPackStatus) => packs.filter((pack) => pack.status === status).length;
    const tabs = [
      { label: 'All Packs', category: 'all', count: packs.length },
      { label: 'Ready', category: 'ready', count: count('ready') },
      { label: 'Draft', category: 'draft', count: count('draft') },
      { label: 'Blocked', category: 'blocked', count: count('blocked') },
      { label: 'Exported', category: 'exported', count: count('exported') },
    ];
    if (count('void') > 0) {
      tabs.push({ label: 'Revoked', category: 'void', count: count('void') });
    }
    return tabs;
  }, [packs]);

  const handleAction = useCallback(
    async (pack: EDFPack, action: EdfPackAction) => {
      const id = Number(pack.id);
      setBusyId(pack.id);
      try {
        if (action === 'validate') {
          await validateEDFPack(id);
          notify(`${pack.packNumber} re-validated against the current ledger.`);
        } else if (action === 'approve') {
          await approveEDFPack(id);
          notify(`${pack.packNumber} approved; the snapshot hash was stored.`);
        } else if (action === 'revoke') {
          await revokeEDFPack(id);
          notify(`${pack.packNumber} revoked; that month can be regenerated.`);
        } else {
          throw new Error(`Unsupported pack action "${action}".`);
        }
        await load();
      } catch (err) {
        notify(errorMessage(err), 'error');
      } finally {
        setBusyId(null);
      }
    },
    [load, notify],
  );

  const handleExport = useCallback(
    (pack: EDFPack, format: EDFPackExportFormat) => {
      downloadEDFPack(Number(pack.id), format);
      notify(`Downloading ${pack.packNumber} as ${format.toUpperCase()}.`);
      // The backend flips approved → exported on the first download, so refresh
      // the board shortly after the file starts rather than guessing the state.
      if (pack.status === 'ready') {
        window.setTimeout(() => void load(), 1500);
      }
    },
    [load, notify],
  );

  const approveActiveDraft = useCallback(async () => {
    if (!activeCompilation) return;
    setBusyId(activeCompilation.packId);
    try {
      await approveEDFPack(Number(activeCompilation.packId));
      notify(`${activeCompilation.packNumber} approved; the snapshot hash was stored.`);
      await load();
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  }, [activeCompilation, load, notify]);

  const handleExportLatest = useCallback(
    (format: EDFPackExportFormat) => {
      if (!latest) return;
      handleExport(latest, format);
    },
    [handleExport, latest],
  );

  const handleGenerate = useCallback(async () => {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) {
      notify('Pick a month first (YYYY-MM).', 'error');
      return;
    }
    setGenerating(true);
    try {
      const pack = await generateEDFPack(Number(match[1]), Number(match[2]));
      notify(`Draft worksheet for ${match[1]}-${match[2]} generated (${pack.line_count ?? 0} invoice lines).`);
      await load();
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setGenerating(false);
    }
  }, [load, month, notify]);

  return (
    <div className="flex flex-col w-full">
      {/* Page Header */}
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
          EDF Pack Management
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
          {description ??
            'Generate, validate, approve and download monthly EDF worksheets. EDFlow never files with a bank or the RBI.'}
        </p>
      </div>

      <div className="flex flex-col gap-space-lg px-space-base py-space-md">
        {/* Ledger strip */}
        <Reveal>
          <div className="mt-space-xs flex items-center justify-between p-space-sm rounded-xl bg-surface-container-high text-on-surface">
            <div className="flex items-center gap-space-xs min-w-0">
              <span className="material-symbols-outlined text-primary-container text-[18px]">
                folder_managed
              </span>
              <span className="font-label-md text-label-md font-semibold truncate">
                {latest
                  ? `Latest pack: ${latest.title} — ${STATUS_LABEL[latest.status]}`
                  : 'No EDF pack generated yet'}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant hidden sm:inline">
                ({data?.totalPacks ?? 0} in ledger)
              </span>
            </div>
            <span className="px-space-xs py-0.5 rounded-md bg-surface-container-lowest font-code-sm text-code-sm text-primary font-semibold">
              {data?.engineVersion ?? latest?.packNumber ?? '—'}
            </span>
          </div>
        </Reveal>

        {data?.errors.summary && (
          <WidgetError title="Ledger total" message={data.errors.summary} />
        )}

        {/* Top Metrics */}
        <Reveal delay={0.05}>
          {packsError && (
            <WidgetError title="Pack metrics" message={packsError} className="mb-space-sm" />
          )}
          <div className="grid grid-cols-2 gap-space-sm">
            {(data?.metrics ?? []).map((metric) => {
              const style = METRIC_STYLES[metric.status ?? 'draft'] ?? METRIC_STYLES.draft;
              return (
                <div
                  key={metric.label}
                  className="flex flex-col p-space-sm rounded-xl bg-surface-container-lowest shadow-sm"
                >
                  <div className="flex items-center justify-between mb-space-xs">
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                      {metric.label}
                    </span>
                    {metric.status === 'ready' ? (
                      <span className="h-2 w-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981]" />
                    ) : (
                      <span className={`material-symbols-outlined text-[16px] ${style.icon}`}>
                        {metric.icon}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-space-xs">
                    <span className="font-headline-md text-headline-md text-on-surface font-bold">
                      {metric.value}
                    </span>
                    <span className={`font-label-sm text-label-sm ${style.badge} px-1 rounded font-semibold`}>
                      {metric.subtitle}
                    </span>
                  </div>
                  <div className="font-code-sm text-code-sm text-on-surface-variant mt-0.5 font-medium truncate">
                    {metric.caption ?? '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>

        {/* Active draft being assembled */}
        {activeCompilation && (
          <EDFReadinessCard
            compilation={activeCompilation}
            onApprove={approveActiveDraft}
            busy={busyId === activeCompilation.packId}
          />
        )}

        {/* Generate control */}
        <Reveal delay={0.15}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-space-xs p-space-sm rounded-xl bg-surface-container-low">
            <span className="font-label-md text-label-md text-on-surface font-semibold sm:flex-1">
              Generate or refresh a monthly worksheet
            </span>
            <input
              type="month"
              aria-label="EDF pack month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-10 px-space-sm rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-body-sm"
            />
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating}
              className="h-10 px-space-md flex items-center justify-center gap-1.5 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md font-semibold disabled:opacity-60"
            >
              <span className={`material-symbols-outlined text-[18px] ${generating ? 'animate-spin' : ''}`}>
                {generating ? 'sync' : 'add_box'}
              </span>
              <span>{generating ? 'Generating…' : 'Generate pack'}</span>
            </button>
          </div>
        </Reveal>

        {/* Filter Tabs */}
        <Reveal delay={0.2}>
          <div className="flex items-center gap-space-xs overflow-x-auto no-scrollbar py-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.category}
                onClick={() => setActiveFilter(tab.category)}
                className={`filter-pill px-space-md py-1.5 rounded-full font-label-md text-label-md font-medium whitespace-nowrap transition-colors ${
                  activeFilter === tab.category
                    ? 'bg-primary-container text-on-primary font-semibold'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
                aria-pressed={activeFilter === tab.category}
                type="button"
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </Reveal>

        <InvoiceToast
          message={toast?.message ?? null}
          tone={toast?.tone}
          onDismiss={() => setToast(null)}
        />

        {/* Pack Table: loading / error / empty / data */}
        {loading ? (
          <Reveal delay={0.25}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
              <p className="font-body-md text-body-md">Loading EDF packs…</p>
            </div>
          </Reveal>
        ) : loadError ? (
          <Reveal delay={0.25}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-error">
              <span className="material-symbols-outlined text-[40px]">error</span>
              <p className="font-body-md text-body-md text-center">{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="h-10 px-space-md flex items-center gap-1.5 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md font-semibold"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>Retry</span>
              </button>
            </div>
          </Reveal>
        ) : packsError ? (
          <Reveal delay={0.25}>
            <WidgetError title="EDF packs" message={packsError} />
          </Reveal>
        ) : packs.length === 0 ? (
          <Reveal delay={0.25}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px]">folder_open</span>
              <p className="font-body-md text-body-md text-center">
                No EDF packs yet. Generate a worksheet for a month above to start.
              </p>
            </div>
          </Reveal>
        ) : (
          <EDFPackTable
            packs={packs}
            activeFilter={activeFilter}
            onAction={handleAction}
            onExport={handleExport}
            busyId={busyId}
          />
        )}

        {/* Download the newest pack */}
        <DispatchCard
          title="Download a worksheet"
          description="Exports are unfiled drafts for your bank or CA. EDFlow never submits a pack to a bank, DGFT or the RBI."
          includes={['JSON snapshot', 'CSV worksheet', 'PDF worksheet']}
          onExport={handleExportLatest}
          disabled={!latest || (latest.status !== 'ready' && latest.status !== 'exported')}
        />
      </div>
    </div>
  );
}

export default EDFPacks;
