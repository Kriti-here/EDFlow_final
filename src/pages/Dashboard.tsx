import { useCallback, useEffect, useState } from 'react';

import {
  AuditActivityCard,
  ComplianceHealthCard,
  EDFReadinessCard,
  FobPipelineCard,
  MatchingStatusCard,
  OpenExceptionsCard,
  OrganizationCard,
  PayPalSettlementCard,
  RecentActivityCard,
} from '../components/dashboard';
import type { ExceptionItemData } from '../components/dashboard';
import Reveal from '../components/Reveal';
import { errorMessage } from '../services/api';
import { resolveException } from '../services/exceptionsService';
import {
  dominantCurrency,
  fetchDashboardStats,
  type DashboardStats,
} from '../services/dashboardService';

/** Currency symbol for display; falls back to the ISO code for exotic ones. */
const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  JPY: '¥',
};

function money(totals: Record<string, string>): { amount: string; currency: string } {
  const currency = dominantCurrency(totals);
  if (!currency) return { amount: '—', currency: '' };
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  return { amount: `${symbol}${totals[currency]}`, currency };
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Per-card entrance delay so the grid staggers in on load. */
const STAGGER_MS = 60;

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
      <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
      <p className="font-body-md text-body-md">Loading dashboard…</p>
    </div>
  );
}

/**
 * Month-end close dashboard. Every figure is derived from a live backend
 * response (invoices, ledger, matches, exceptions, EDF packs, purpose
 * recommendations and the audit chain) — see services/dashboardService.ts.
 */
function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchDashboardStats()
      .then((res) => {
        setStats(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolveException = useCallback(
    async (id: string) => {
      await resolveException(Number(id));
      load();
    },
    [load],
  );

  if (loading && !stats) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 lg:px-6">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight text-on-surface md:text-headline-lg">
          Dashboard
        </h1>
        <LoadingState />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 lg:px-6">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight text-on-surface md:text-headline-lg">
          Dashboard
        </h1>
        <div className="flex flex-col items-center justify-center gap-space-sm rounded-2xl bg-error-container/40 py-space-xl text-error">
          <span className="material-symbols-outlined text-[40px]">error</span>
          <p className="font-body-md text-body-md">Error: {error ?? 'no data'}</p>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 rounded-full bg-primary px-space-base py-2 font-label-md text-label-md text-on-primary"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { invoices, ledger, matches, exceptions, edf } = stats;

  // --- compliance health (all three tracks are real ratios) ---
  const firRate = matches.rate;
  const purposeRate = percent(stats.purpose.accepted, stats.purpose.total);
  const clearedRate =
    exceptions.total > 0 ? percent(exceptions.total - exceptions.open, exceptions.total) : 100;
  const complianceScore = Math.round(((firRate + purposeRate + clearedRate) / 3) * 10) / 10;

  // --- EDF readiness ---
  const edfReady = edf.approved + edf.exported;
  const edfReadiness = edf.total > 0 ? percent(edfReady, edf.total) : 0;

  // --- FOB pipeline split ---
  const pipelineTotal = invoices.total;
  const paidPct = percent(invoices.paid, pipelineTotal);
  const sentPct = percent(invoices.sent, pipelineTotal);
  const draftPct = percent(invoices.draft, pipelineTotal);

  // --- money ---
  const invoicedMoney = money(invoices.totalByCurrency);
  const receivedMoney = money(ledger.netByCurrency);

  // --- exceptions queue ---
  const urgentCount = exceptions.critical + exceptions.high;
  const exceptionItems: ExceptionItemData[] = stats.exceptionItems.map((item) => ({
    id: String(item.id),
    invoice: item.invoice,
    counterparty: item.counterparty,
    description: [{ text: item.summary }],
    supportNote:
      item.confidenceBp != null
        ? `${SEVERITY_LABEL[item.severity] ?? item.severity} · confidence ${(item.confidenceBp / 100).toFixed(1)}%`
        : `${SEVERITY_LABEL[item.severity] ?? item.severity} severity`,
    icon: item.severity === 'critical' || item.severity === 'high' ? 'error' : 'help_outline',
    iconClass: item.severity === 'critical' || item.severity === 'high' ? 'text-error' : 'text-secondary',
    actionLabel: 'Resolve',
    actionIcon: 'done',
    successMessage: `${item.invoice} resolved.`,
    urgent: item.severity === 'critical' || item.severity === 'high',
  }));

  const identifiers = [
    stats.exporter.ie_code ? `IEC #${stats.exporter.ie_code}` : null,
    stats.exporter.ad_code ? `AD Code #${stats.exporter.ad_code}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  const now = new Date();
  const periodLabel = now.toLocaleString(undefined, { month: 'short', year: 'numeric' });

  const orgTelemetry = [
    {
      label: 'EDFlow API',
      value: stats.unavailable.includes('health') ? 'Unreachable' : 'Connected',
    },
    {
      label: 'Audit Chain',
      value: stats.audit.chainOk ? 'Intact' : 'Broken',
    },
  ];

  const audit = stats.audit;
  const latest = audit.latest;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 lg:px-6 animate-page-enter">
      <div className="flex items-center justify-between gap-space-sm">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight text-on-surface md:text-headline-lg">
          Dashboard
        </h1>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-space-sm py-1.5 font-label-sm text-label-sm text-on-surface hover:bg-surface-container-highest disabled:opacity-50 transition-colors"
        >
          <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
            refresh
          </span>
          Refresh
        </button>
      </div>

      {stats.unavailable.length > 0 && (
        <div className="flex items-center gap-space-xs rounded-xl bg-amber-50 px-space-md py-space-sm text-amber-800">
          <span className="material-symbols-outlined text-[18px]">warning</span>
          <p className="font-label-sm text-label-sm">
            Some sources are unavailable: {stats.unavailable.join(', ')}. Those cards show zeros.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Reveal className="lg:col-span-12">
          <ComplianceHealthCard
            score={complianceScore.toFixed(1)}
            scoreLabel={complianceScore >= 90 ? 'Audit Ready' : 'Needs Review'}
            deltaLabel="Live data"
            metrics={[
              { label: 'FIRA Bank Match', value: `${firRate.toFixed(1)}%`, percent: firRate, barClass: 'bg-primary' },
              {
                label: 'Purpose Code Acceptance',
                value: `${purposeRate.toFixed(1)}%`,
                percent: purposeRate,
                barClass: 'bg-tertiary-container',
              },
              {
                label: 'Exceptions Cleared',
                value: `${clearedRate.toFixed(1)}%`,
                percent: clearedRate,
                barClass: 'bg-secondary',
              },
            ]}
          />
        </Reveal>

        <Reveal delay={STAGGER_MS} className="lg:col-span-4">
          <MatchingStatusCard
            matchRate={`${matches.rate}%`}
            label="Auto Reconciliation"
            value={`${matches.matched} / ${matches.total}`}
            caption="Matched to FIRA lines"
            pendingNote={`${matches.unmatched + matches.exception} pending review`}
          />
        </Reveal>

        <Reveal delay={STAGGER_MS * 2} className="lg:col-span-4">
          <EDFReadinessCard
            assembledLabel={`${edfReady} / ${edf.total} Packs Ready`}
            readinessPercent={edfReadiness}
            stages={[
              { count: String(edfReady), label: 'Ready', countClass: 'text-emerald-500' },
              { count: String(edf.draft), label: 'Drafting', countClass: 'text-secondary' },
              { count: String(edf.blocked), label: 'Blocked', countClass: 'text-error' },
            ]}
            dispatchLabel="Open EDF Packs"
          />
        </Reveal>

        <Reveal delay={STAGGER_MS * 3} className="lg:col-span-4">
          <PayPalSettlementCard
            collectionsReceived={ledger.count}
            settlementsProcessed={ledger.linked}
            healthPercent={ledger.count > 0 ? Math.round((ledger.linked / ledger.count) * 100) : 0}
            healthLabel={`${ledger.count} PayPal payments recorded`}
            settledVolume={receivedMoney.amount}
          />
        </Reveal>

        <Reveal delay={STAGGER_MS * 4} className="lg:col-span-12">
          <OpenExceptionsCard
            badge={urgentCount > 0 ? `${urgentCount} Urgent` : `${exceptions.open} Open`}
            description="Open reconciliation exceptions awaiting a human decision before EDF generation."
            items={exceptionItems}
            onResolve={handleResolveException}
          />
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Reveal>
          <OrganizationCard
            name={stats.exporter.legal_name}
            verifiedTitle="Registered exporter profile"
            identifiers={identifiers || 'No IEC / AD code set in Settings'}
            period={periodLabel}
            telemetry={orgTelemetry}
          />
        </Reveal>

        <Reveal delay={STAGGER_MS}>
          <FobPipelineCard
            eyebrow="Total Invoiced"
            total={invoicedMoney.amount}
            shipmentCount={`${invoices.total} Invoices`}
            ingestLabel="Open Invoices"
            segments={[
              {
                label: `${invoices.paid} Paid`,
                percent: paidPct,
                barClass: 'bg-emerald-500 rounded-l-full',
                dotClass: 'bg-emerald-500',
                labelClass: 'text-on-surface-variant',
              },
              {
                label: `${invoices.sent} Sent`,
                percent: sentPct,
                barClass: 'bg-secondary',
                dotClass: 'bg-secondary',
                labelClass: 'text-on-surface-variant',
              },
              {
                label: `${invoices.draft} Draft`,
                percent: draftPct,
                barClass: 'bg-error rounded-r-full',
                dotClass: 'bg-error',
                labelClass: 'text-error font-medium',
              },
            ]}
            filters={[
              { label: `All (${invoices.total})`, active: true },
              { label: `Paid (${invoices.paid})` },
              { label: `Sent (${invoices.sent})` },
              { label: `Draft (${invoices.draft})` },
            ]}
          />
        </Reveal>

        <Reveal delay={STAGGER_MS * 2}>
          <RecentActivityCard
            badge="PayPal"
            label="Recorded Inflow"
            primary={{ amount: receivedMoney.amount, currency: receivedMoney.currency || '—' }}
            secondary={{ amount: `${ledger.linked} linked`, currency: 'to invoices' }}
            footnote={`${ledger.count} payments on record`}
          />
        </Reveal>

        <Reveal delay={STAGGER_MS * 3}>
          <AuditActivityCard
            blockLabel={latest ? `ENTRY #${latest.id}` : 'NO ENTRIES'}
            rootHash={latest?.hash ?? '—'}
            witness={latest ? `Actor: ${latest.actor}` : 'No audit activity yet'}
            verifiedLabel={audit.chainOk ? 'Verified' : 'Broken'}
            detail={latest ? latest.action : 'Hash chain'}
            timestamp={latest ? new Date(latest.ts).toLocaleString() : '—'}
          />
        </Reveal>
      </div>
    </div>
  );
}

export default Dashboard;
