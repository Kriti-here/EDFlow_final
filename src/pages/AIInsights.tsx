import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import Reveal from '../components/Reveal';
import { MetricCard, ProgressBar } from '../components/aiinsights';
import { getNavItem } from '../config/navigation';
import {
  fetchAIInsights,
  type AIInsightsData,
  type ExceptionTrendPoint,
} from '../services/aiInsightsService';
import type { ConfidenceBar, MetricCardData } from '../types/aiinsights';

const { label, description } = getNavItem('/ai-insights');

// --- presentation helpers (no data is invented here) ---

const BAND_ORDER = ['high', 'medium', 'low'];
const BAND_COLOR: Record<string, string> = {
  high: 'bg-primary',
  medium: 'bg-amber-400',
  low: 'bg-error',
};
const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-error',
  high: 'bg-error/60',
  medium: 'bg-amber-400',
  low: 'bg-tertiary-fixed-dim',
};

function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function tile(
  id: string,
  label: string,
  value: string,
  subtitle: string,
  icon: string,
  iconColor?: string,
): MetricCardData {
  return { id, label, value, subtitle, icon, iconColor };
}

/** A titled dashboard section with an icon and short description. */
function Section({
  title,
  subtitle,
  icon,
  delay = 0,
  children,
}: {
  title: string;
  subtitle: string;
  icon: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <Reveal delay={delay}>
      <section className="flex flex-col gap-space-sm">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{subtitle}</p>
        {children}
      </section>
    </Reveal>
  );
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-surface-container-lowest rounded-2xl shadow-sm p-space-md ${className}`}>
      {children}
    </div>
  );
}

/** Counts keyed by name rendered as horizontal confidence bars. */
function Breakdown({
  counts,
  total,
  emptyText,
  colorFn = (k: string) => BAND_COLOR[k] ?? 'bg-outline-variant',
}: {
  counts: Record<string, number>;
  total: number;
  emptyText: string;
  colorFn?: (key: string) => string;
}) {
  const keys = [
    ...BAND_ORDER.filter((k) => counts[k] !== undefined),
    ...Object.keys(counts).filter((k) => !BAND_ORDER.includes(k)),
  ];

  if (keys.length === 0) {
    return <p className="font-body-sm text-body-sm text-on-surface-variant">{emptyText}</p>;
  }

  return (
    <div className="flex flex-col gap-space-sm">
      {keys.map((key) => {
        const count = counts[key] ?? 0;
        const rate = percent(count, total);
        const bar: ConfidenceBar = {
          id: key,
          label: titleCase(key),
          percentage: rate,
          color: colorFn(key),
          description: `${count} · ${rate}%`,
        };
        return <ProgressBar key={key} data={bar} />;
      })}
    </div>
  );
}

/** Counts rendered as a compact ranked list. */
function CountList({ counts, emptyText }: { counts: Record<string, number>; emptyText: string }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <p className="font-body-sm text-body-sm text-on-surface-variant">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col gap-space-xs">
      {entries.map(([key, count]) => (
        <li key={key} className="flex items-center justify-between gap-space-sm">
          <span className="font-body-sm text-body-sm text-on-surface-variant capitalize truncate">
            {titleCase(key)}
          </span>
          <span className="font-code-sm text-code-sm text-on-surface font-bold shrink-0">{count}</span>
        </li>
      ))}
    </ul>
  );
}

function PanelTitle({ children, legend }: { children: ReactNode; legend?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-space-sm mb-space-sm">
      <h3 className="font-label-md text-label-md text-on-surface uppercase tracking-wider font-semibold">
        {children}
      </h3>
      {legend}
    </div>
  );
}

/** Seven-day opened vs resolved exception bars (CSS only, no chart dependency). */
function TrendChart({ trend }: { trend: ExceptionTrendPoint[] }) {
  const max = Math.max(1, ...trend.map((p) => Math.max(p.opened, p.resolved)));
  return (
    <div className="flex items-end justify-between gap-space-xs h-40">
      {trend.map((point) => (
        <div key={point.label} className="flex flex-col items-center gap-space-xs flex-1 min-w-0">
          <div className="flex items-end justify-center gap-1 h-32 w-full">
            <div
              className="w-2.5 rounded-t bg-error transition-[height] duration-500"
              style={{ height: `${(point.opened / max) * 100}%` }}
              title={`${point.opened} opened`}
            />
            <div
              className="w-2.5 rounded-t bg-primary transition-[height] duration-500"
              style={{ height: `${(point.resolved / max) * 100}%` }}
              title={`${point.resolved} resolved`}
            />
          </div>
          <span className="font-code-sm text-code-sm text-on-surface-variant truncate">
            {point.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrendLegend() {
  return (
    <div className="flex items-center gap-space-base">
      <span className="flex items-center gap-space-2xs font-label-sm text-label-sm text-on-surface-variant">
        <span className="w-2.5 h-2.5 rounded-sm bg-error" /> Opened
      </span>
      <span className="flex items-center gap-space-2xs font-label-sm text-label-sm text-on-surface-variant">
        <span className="w-2.5 h-2.5 rounded-sm bg-primary" /> Resolved
      </span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
      <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
      <p className="font-body-md text-body-md">Loading AI insights…</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-error">
      <span className="material-symbols-outlined text-[40px]">error</span>
      <p className="font-body-md text-body-md">Error: {message}</p>
    </div>
  );
}

/**
 * AI Insights dashboard. Read-only: it summarises proposals, purpose
 * recommendations, match confidence and exception trends from endpoints that
 * already exist. Nothing here runs a task or decides a proposal.
 */
function AIInsights() {
  const [data, setData] = useState<AIInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAIInsights()
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex flex-col w-full">
      {/* Page Header */}
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
          {label}
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{description}</p>
      </div>

      <div className="flex flex-col w-full gap-space-base px-space-base pb-space-xl">
        {/* Advisory banner */}
        <Reveal>
          <div className="flex items-center px-space-md py-space-xs rounded-xl bg-surface-container-low text-on-surface shadow-sm">
            <span className="material-symbols-outlined text-[18px] text-primary mr-space-xs">
              auto_awesome
            </span>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              Advisory metrics only — a human accepts or rejects every AI suggestion. Nothing is
              sent or filed automatically.
            </p>
          </div>
        </Reveal>

        {loading ? (
          <Reveal>
            <LoadingState />
          </Reveal>
        ) : error ? (
          <Reveal>
            <ErrorState message={error} />
          </Reveal>
        ) : data ? (
          <>
            {/* 1. AI proposal metrics */}
            <Section
              title="AI Proposal Metrics"
              subtitle="Stored proposals from the record/replay cache, by decision status."
              icon="description"
              delay={0.05}
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-space-sm">
                <MetricCard
                  data={tile('p-total', 'Proposals', String(data.proposals.total), 'Stored proposals', 'description')}
                />
                <MetricCard
                  data={tile('p-accepted', 'Accepted', String(data.proposals.accepted), 'Human-approved', 'check_circle', 'text-emerald-600')}
                />
                <MetricCard
                  data={tile('p-pending', 'Pending', String(data.proposals.proposed), 'Awaiting decision', 'schedule')}
                />
                <MetricCard
                  data={tile('p-rejected', 'Rejected', String(data.proposals.rejected), 'Declined by human', 'cancel', 'text-error')}
                />
                <MetricCard
                  data={tile('p-cache', 'Cache Hit Rate', `${data.proposals.cacheHitRate}%`, 'Served from replay cache', 'cached')}
                />
                <MetricCard
                  data={tile('p-confidence', 'Avg Confidence', `${data.proposals.avgConfidencePct}%`, 'Mean across proposals', 'speed')}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                <Panel>
                  <PanelTitle>Confidence Bands</PanelTitle>
                  <Breakdown
                    counts={data.proposals.byBand}
                    total={data.proposals.total}
                    emptyText="No proposal confidence data yet."
                  />
                </Panel>
                <Panel>
                  <PanelTitle>Proposals by Task</PanelTitle>
                  <CountList counts={data.proposals.byTask} emptyText="No proposals recorded yet." />
                </Panel>
              </div>
            </Section>

            {/* 2. Purpose recommendation metrics */}
            <Section
              title="Purpose Recommendation Metrics"
              subtitle="AI purpose-code suggestions and how often they are accepted."
              icon="category"
              delay={0.1}
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-space-sm">
                <MetricCard
                  data={tile('r-total', 'Recommendations', String(data.purpose.total), 'All purpose suggestions', 'category')}
                />
                <MetricCard
                  data={tile('r-accepted', 'Accepted', String(data.purpose.accepted), 'Human-approved', 'check_circle', 'text-emerald-600')}
                />
                <MetricCard
                  data={tile('r-rate', 'Acceptance Rate', `${data.purpose.acceptanceRate}%`, 'Accepted / total', 'percent')}
                />
                <MetricCard
                  data={tile('r-pending', 'Pending', String(data.purpose.proposed), 'Awaiting decision', 'schedule')}
                />
                <MetricCard
                  data={tile('r-superseded', 'Superseded', String(data.purpose.superseded), 'Replaced by newer', 'history')}
                />
                <MetricCard
                  data={tile('r-rejected', 'Rejected', String(data.purpose.rejected), 'Declined by human', 'cancel', 'text-error')}
                />
              </div>
              <Panel>
                <PanelTitle>Confidence Bands</PanelTitle>
                <Breakdown
                  counts={data.purpose.byBand}
                  total={data.purpose.total}
                  emptyText="No purpose recommendation confidence data yet."
                />
              </Panel>
            </Section>

            {/* 3. Match confidence metrics */}
            <Section
              title="Match Confidence Metrics"
              subtitle="FIRA ↔ invoice match decisions and the confidence behind them."
              icon="hub"
              delay={0.15}
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-space-sm">
                <MetricCard
                  data={tile('m-total', 'Matches', String(data.matches.total), 'Decided matches', 'hub')}
                />
                <MetricCard
                  data={tile('m-confirmed', 'Confirmed', String(data.matches.confirmed), 'Confirmed matches', 'verified', 'text-emerald-600')}
                />
                <MetricCard
                  data={tile('m-confidence', 'Avg Confidence', `${data.matches.avgConfidencePct}%`, 'Mean across matches', 'speed')}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                <Panel>
                  <PanelTitle>Confidence Bands</PanelTitle>
                  <Breakdown
                    counts={data.matches.bands}
                    total={data.matches.total}
                    emptyText="No match confidence data yet."
                  />
                </Panel>
                <Panel>
                  <PanelTitle>Matches by Status</PanelTitle>
                  <CountList counts={data.matches.byStatus} emptyText="No matches recorded yet." />
                </Panel>
              </div>
            </Section>

            {/* 4. Exception trends */}
            <Section
              title="Exception Trends"
              subtitle="Open workload and the last seven days of openings and resolutions."
              icon="trending_up"
              delay={0.2}
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-space-sm">
                <MetricCard
                  data={tile('e-open', 'Open', String(data.exceptions.open), 'Needs attention', 'error', 'text-error')}
                />
                <MetricCard
                  data={tile('e-ack', 'Acknowledged', String(data.exceptions.acknowledged), 'Seen, not resolved', 'visibility')}
                />
                <MetricCard
                  data={tile('e-resolved', 'Resolved', String(data.exceptions.resolved), 'Closed out', 'task_alt', 'text-emerald-600')}
                />
                <MetricCard
                  data={tile('e-dismissed', 'Dismissed', String(data.exceptions.dismissed), 'Dismissed as noise', 'block')}
                />
                <MetricCard
                  data={tile('e-opened7', 'Opened (7d)', String(data.exceptions.openedLast7), 'Raised in last 7 days', 'add_alert')}
                />
                <MetricCard
                  data={tile('e-resolved7', 'Resolved (7d)', String(data.exceptions.resolvedLast7), 'Closed in last 7 days', 'task_alt', 'text-emerald-600')}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm">
                <Panel className="md:col-span-2">
                  <PanelTitle legend={<TrendLegend />}>Last 7 Days</PanelTitle>
                  <TrendChart trend={data.exceptions.trend} />
                </Panel>
                <Panel>
                  <PanelTitle>By Severity</PanelTitle>
                  <Breakdown
                    counts={data.exceptions.bySeverity}
                    total={data.exceptions.total}
                    emptyText="No exceptions recorded yet."
                    colorFn={(key) => SEVERITY_COLOR[key] ?? 'bg-outline-variant'}
                  />
                </Panel>
              </div>
            </Section>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default AIInsights;
