import { useEffect, useState } from 'react';
import Reveal from '../components/Reveal';
import {
  ExceptionsMetrics,
  ExceptionFilters,
  ExceptionRow,
  ExceptionsQueueCard,
  ResolutionPanel,
} from '../components/exceptions';
import {
  filterPills,
  sections,
} from '../data/exceptions';
import { fetchExceptions } from '../services/exceptionsService';
import type { ExceptionKpi } from '../types/exceptions';

function ExceptionsHub() {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [showToast, setShowToast] = useState<boolean>(false);

  // Live data state
  const [kpiMetrics, setKpiMetrics] = useState<ExceptionKpi[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [resolvedExceptions, setResolvedExceptions] = useState<any[]>([]);
  const [totalResolved, setTotalResolved] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchExceptions()
      .then((data) => {
        setKpiMetrics(data.kpis);
        setExceptions(data.exceptions);
        setResolvedExceptions(data.resolvedToday);
        setTotalResolved(data.totalResolved);
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

  const handleResolve = (_id: string, message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2800);
  };

  const handleSecondaryAction = (_id: string, action: string) => {
    setToastMessage(`Action: ${action}`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2800);
  };

  const filteredExceptions = activeFilter === 'all'
    ? exceptions
    : exceptions.filter(exc => exc.categories.includes(activeFilter as any));

  // Group exceptions by section
  const getExceptionsForSection = (sectionId: string) => {
    return filteredExceptions.filter(exc => {
      if (sectionId === 'critical') return exc.severity === 'critical';
      if (sectionId === 'high') return exc.severity === 'high';
      if (sectionId === 'medium') return exc.severity === 'medium';
      return false;
    });
  };

  return (
    <div className="flex flex-col w-full">
      {/* Page Header */}
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
          Exceptions Hub
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Identify, investigate and resolve reconciliation issues before EDF generation.
        </p>
      </div>

      <div className="flex flex-col w-full px-space-base pb-space-xl gap-space-base">
        {/* EDPMS Gateway Monitoring Banner */}
        <Reveal>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <span className="flex h-2 w-2 rounded-full bg-error animate-ping" />
              <span className="font-label-sm text-label-sm text-error uppercase tracking-wider font-semibold">
                EDPMS Gateway Monitoring Active
              </span>
            </div>
            <button
              className="flex items-center gap-space-2xs text-on-surface-variant hover:text-primary transition-colors py-1 px-2 rounded-xl hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-[16px]">sync</span>
              <span className="font-label-sm text-label-sm">Sync Live</span>
            </button>
          </div>
        </Reveal>

        {/* Top KPI Metrics */}
        <Reveal delay={0.05}>
          <ExceptionsMetrics metrics={kpiMetrics} />
        </Reveal>

        {/* Search & Filters */}
        <Reveal delay={0.1}>
          <ExceptionFilters filters={filterPills} onFilterChange={handleFilterChange} />
        </Reveal>

        {/* Loading / Error / Empty / Data states */}
        {loading ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
              <p className="font-body-md text-body-md">Loading exceptions…</p>
            </div>
          </Reveal>
        ) : error ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-error">
              <span className="material-symbols-outlined text-[40px]">error</span>
              <p className="font-body-md text-body-md">Error: {error}</p>
            </div>
          </Reveal>
        ) : exceptions.length === 0 ? (
          <Reveal delay={0.15}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px]">check_circle</span>
              <p className="font-body-md text-body-md">No open exceptions. All clear!</p>
            </div>
          </Reveal>
        ) : (
          <>
            {/* Critical Issues Section */}
            {getExceptionsForSection('critical').length > 0 && (
              <Reveal delay={0.15}>
                <ExceptionsQueueCard
                  section={{
                    ...sections[0],
                    count: getExceptionsForSection('critical').length,
                  }}
                >
                  {getExceptionsForSection('critical').map((exception) => (
                    <ExceptionRow
                      key={exception.id}
                      exception={exception}
                      onResolve={handleResolve}
                      onSecondaryAction={handleSecondaryAction}
                    />
                  ))}
                </ExceptionsQueueCard>
              </Reveal>
            )}

            {/* High Priority Section */}
            {getExceptionsForSection('high').length > 0 && (
              <Reveal delay={0.2}>
                <ExceptionsQueueCard
                  section={{
                    ...sections[1],
                    count: getExceptionsForSection('high').length,
                  }}
                >
                  {getExceptionsForSection('high').map((exception) => (
                    <ExceptionRow
                      key={exception.id}
                      exception={exception}
                      onResolve={handleResolve}
                      onSecondaryAction={handleSecondaryAction}
                    />
                  ))}
                </ExceptionsQueueCard>
              </Reveal>
            )}

            {/* Medium Priority Section */}
            {getExceptionsForSection('medium').length > 0 && (
              <Reveal delay={0.25}>
                <ExceptionsQueueCard
                  section={{
                    ...sections[2],
                    count: getExceptionsForSection('medium').length,
                  }}
                >
                  {getExceptionsForSection('medium').map((exception) => (
                    <ExceptionRow
                      key={exception.id}
                      exception={exception}
                      onResolve={handleResolve}
                      onSecondaryAction={handleSecondaryAction}
                    />
                  ))}
                </ExceptionsQueueCard>
              </Reveal>
            )}
          </>
        )}

        {/* Resolved Today Section */}
        <Reveal delay={0.3}>
          <ResolutionPanel
            resolvedExceptions={resolvedExceptions}
            totalResolved={totalResolved}
          />
        </Reveal>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 transform translate-y-0 opacity-100 pointer-events-auto transition-all duration-300 ease-out flex items-center gap-space-sm px-space-base py-space-sm rounded-xl bg-inverse-surface text-inverse-on-surface shadow-xl">
          <span className="material-symbols-outlined text-[20px] text-tertiary-fixed">
            check_circle
          </span>
          <span className="font-label-md text-label-md">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default ExceptionsHub;
