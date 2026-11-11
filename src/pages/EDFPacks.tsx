import { useEffect, useState } from 'react';
import Reveal from '../components/Reveal';
import {
  EDFReadinessCard,
  EDFPackTable,
  DispatchCard,
} from '../components/edf';
import {
  batchExportInfo,
  filterTabs,
} from '../data/edf';
import { fetchEDFPacks } from '../services/edfService';
import type { EDFPack, PackMetric, ActiveCompilation } from '../types/edf';

function EDFPacks() {
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Live data state
  const [metrics, setMetrics] = useState<PackMetric[]>([]);
  const [activeCompilation, setActiveCompilation] = useState<ActiveCompilation | null>(null);
  const [packs, setPacks] = useState<EDFPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEDFPacks()
      .then((data) => {
        setMetrics(data.metrics);
        setActiveCompilation(data.activeCompilation);
        setPacks(data.packs);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleFilterChange = (category: string) => {
    setActiveFilter(category);
  };

  return (
    <div className="flex flex-col w-full">
      {/* Page Header */}
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
          EDF Pack Management
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
          Generate, validate, seal, and export audit-ready Export Declaration dossiers to AD-Cat 1 banking portals.
        </p>
      </div>

      <div className="flex flex-col gap-space-lg px-space-base py-space-md">
        {/* Live Filing Cycle Meter */}
        <Reveal>
          <div className="mt-space-xs flex items-center justify-between p-space-sm rounded-xl bg-surface-container-high text-on-surface">
            <div className="flex items-center gap-space-xs min-w-0">
              <span className="material-symbols-outlined text-primary-container text-[18px]">
                schedule
              </span>
              <span className="font-label-md text-label-md font-semibold truncate">
                Filing Window: 7 Days Remaining
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant hidden sm:inline">
                (Q3 FY24-25)
              </span>
            </div>
            <span className="px-space-xs py-0.5 rounded-md bg-surface-container-lowest font-code-sm text-code-sm text-primary font-semibold">
              CYCLE #84
            </span>
          </div>
        </Reveal>

        {/* Top Metrics */}
        <Reveal delay={0.05}>
          <div className="grid grid-cols-2 gap-space-sm">
            {metrics.map((metric) => {
              const statusClass = metric.status === 'ready' ? 'bg-[#10B981]' :
                                metric.status === 'blocked' ? 'bg-error' :
                                metric.status === 'exported' ? 'bg-secondary' : 'bg-primary-container';
              const textClass = metric.status === 'ready' ? 'text-[#065F46]' :
                               metric.status === 'blocked' ? 'text-error' :
                               metric.status === 'exported' ? 'text-secondary' : 'text-primary-container';

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
                      <span className="h-2 w-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981]"></span>
                    ) : metric.status === 'blocked' ? (
                      <span className="material-symbols-outlined text-[16px] text-error">warning</span>
                    ) : metric.status === 'exported' ? (
                      <span className="material-symbols-outlined text-[16px] text-secondary">verified_user</span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px] text-primary-container">pending</span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-space-xs">
                    <span className="font-headline-md text-headline-md text-on-surface font-bold">
                      {metric.value}
                    </span>
                    <span className={`font-label-sm text-label-sm ${textClass} font-semibold bg-opacity-20 bg-${statusClass.split('bg-')[1]} px-1 rounded`}>
                      {metric.subtitle}
                    </span>
                  </div>
                  <div className="font-code-sm text-code-sm text-on-surface-variant mt-0.5 font-medium truncate">
                    {metric.status === 'ready' && '₹1.18 Cr eq. ($142.5k)'}
                    {metric.status === 'draft' && '78% Assembled'}
                    {metric.status === 'blocked' && '2 Open Exceptions'}
                    {metric.status === 'exported' && '100% Reconciled'}
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>

        {/* Active Compilation Card */}
        {activeCompilation && <EDFReadinessCard compilation={activeCompilation} />}

        {/* Filter Tabs */}
        <Reveal delay={0.2}>
          <div className="flex items-center gap-space-xs overflow-x-auto no-scrollbar py-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.category}
                onClick={() => handleFilterChange(tab.category)}
                className={`filter-pill px-space-md py-1.5 rounded-full font-label-md text-label-md font-medium whitespace-nowrap transition-colors ${
                  activeFilter === tab.category
                    ? 'bg-primary-container text-on-primary font-semibold'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
                type="button"
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </Reveal>

        {/* Pack Table: loading / error / empty / data */}
        {loading ? (
          <Reveal delay={0.25}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
              <p className="font-body-md text-body-md">Loading EDF packs…</p>
            </div>
          </Reveal>
        ) : error ? (
          <Reveal delay={0.25}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-error">
              <span className="material-symbols-outlined text-[40px]">error</span>
              <p className="font-body-md text-body-md">Error: {error}</p>
            </div>
          </Reveal>
        ) : packs.length === 0 ? (
          <Reveal delay={0.25}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px]">folder_open</span>
              <p className="font-body-md text-body-md">No EDF packs found.</p>
            </div>
          </Reveal>
        ) : (
          <EDFPackTable packs={packs} activeFilter={activeFilter} />
        )}

        {/* Batch Export Card */}
        <DispatchCard
          title={batchExportInfo.title}
          description={batchExportInfo.description}
          buttonLabel={batchExportInfo.buttonLabel}
          includes={batchExportInfo.includes}
        />
      </div>
    </div>
  );
}

export default EDFPacks;
