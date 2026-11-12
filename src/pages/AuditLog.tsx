import { useCallback, useEffect, useState } from 'react';

import Reveal from '../components/Reveal';
import { MetricCard } from '../components/aiinsights';
import { getNavItem } from '../config/navigation';
import { errorMessage } from '../services/api';
import { fetchAuditLog, type AuditEntry, type AuditLogResponse } from '../services/auditService';
import type { MetricCardData } from '../types/aiinsights';

const { label, description } = getNavItem('/audit');

/** Format an ISO timestamp for display, falling back to the raw value. */
function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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

function ChainBanner({ data }: { data: AuditLogResponse }) {
  const ok = data.chain_ok;
  return (
    <div
      className={`flex items-center gap-space-xs px-space-md py-space-sm rounded-xl shadow-sm ${
        ok ? 'bg-emerald-50 text-emerald-800' : 'bg-error-container text-on-error-container'
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">
        {ok ? 'verified_user' : 'gpp_bad'}
      </span>
      <p className="font-label-md text-label-md">
        {ok
          ? 'Hash chain verified — every audit row is intact and tamper-evident.'
          : `Hash chain BROKEN at row ${data.first_bad_row ?? 'unknown'} — data may have been altered.`}
      </p>
    </div>
  );
}

/** Hash-chained audit history, read from GET /audit. */
function AuditLog() {
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAuditLog(100)
      .then((res) => {
        setData(res);
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

  const entries: AuditEntry[] = data?.entries ?? [];

  return (
    <div className="flex flex-col w-full">
      <div className="px-space-base pt-space-md pb-space-xs flex items-start justify-between gap-space-sm">
        <div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
            {label}
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{description}</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-space-sm py-1.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm hover:bg-surface-container-highest disabled:opacity-50 transition-colors"
        >
          <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
            refresh
          </span>
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-space-base px-space-base pb-space-xl">
        {loading && !data ? (
          <Reveal>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
              <p className="font-body-md text-body-md">Loading audit history…</p>
            </div>
          </Reveal>
        ) : error ? (
          <Reveal>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-error">
              <span className="material-symbols-outlined text-[40px]">error</span>
              <p className="font-body-md text-body-md">Error: {error}</p>
            </div>
          </Reveal>
        ) : data ? (
          <>
            <Reveal>
              <ChainBanner data={data} />
            </Reveal>

            <Reveal delay={0.05}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-space-sm">
                <MetricCard
                  data={tile('a-count', 'Entries Shown', String(entries.length), 'Newest first', 'history')}
                />
                <MetricCard
                  data={tile(
                    'a-chain',
                    'Chain Status',
                    data.chain_ok ? 'Intact' : 'Broken',
                    'SHA-256 linked rows',
                    data.chain_ok ? 'shield_lock' : 'gpp_bad',
                    data.chain_ok ? 'text-emerald-600' : 'text-error',
                  )}
                />
                <MetricCard
                  data={tile(
                    'a-bad',
                    'First Bad Row',
                    data.first_bad_row == null ? 'None' : String(data.first_bad_row),
                    'First failed link',
                    'breaking_news',
                  )}
                />
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-space-xl text-center rounded-2xl bg-surface-container-lowest shadow-sm">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-[22px]">receipt_long</span>
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    No audit entries yet. Actions you take in EDFlow will appear here.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-surface-container-lowest shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-container-low text-on-surface-variant">
                          <th className="px-space-sm py-space-xs font-label-sm text-label-sm uppercase tracking-wider">#</th>
                          <th className="px-space-sm py-space-xs font-label-sm text-label-sm uppercase tracking-wider">Time</th>
                          <th className="px-space-sm py-space-xs font-label-sm text-label-sm uppercase tracking-wider">Actor</th>
                          <th className="px-space-sm py-space-xs font-label-sm text-label-sm uppercase tracking-wider">Action</th>
                          <th className="px-space-sm py-space-xs font-label-sm text-label-sm uppercase tracking-wider">Entity</th>
                          <th className="px-space-sm py-space-xs font-label-sm text-label-sm uppercase tracking-wider">Hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry) => (
                          <tr key={entry.id} className="border-t border-surface-container-high/70">
                            <td className="px-space-sm py-space-xs font-code-sm text-code-sm text-on-surface-variant">
                              {entry.id}
                            </td>
                            <td className="px-space-sm py-space-xs font-code-sm text-code-sm text-on-surface whitespace-nowrap">
                              {formatTs(entry.ts)}
                            </td>
                            <td className="px-space-sm py-space-xs font-body-sm text-body-sm text-on-surface-variant">
                              {entry.actor}
                            </td>
                            <td className="px-space-sm py-space-xs font-body-sm text-body-sm text-on-surface">
                              {entry.action}
                            </td>
                            <td className="px-space-sm py-space-xs font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                              {entry.entity}
                              {entry.entity_id != null ? ` #${entry.entity_id}` : ''}
                            </td>
                            <td className="px-space-sm py-space-xs font-code-sm text-code-sm text-on-surface-variant">
                              {entry.hash}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Reveal>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default AuditLog;
