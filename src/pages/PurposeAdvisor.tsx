import { useEffect, useState } from 'react';
import Reveal from '../components/Reveal';
import {
  PurposeRecommendationCard,
  PurposeCodeExplorer,
  SuggestedPurposePanel,
} from '../components/purpose';
import { purposeCodeReferences, regulatoryInfo } from '../data/purpose';
import { fetchPurposeQueue } from '../services/purposeService';
import type { QueueItem, PurposeCase, Metric } from '../types/purpose';

function PurposeAdvisor() {
  const [toastMessage, setToastMessage] = useState<string>('');
  const [showToast, setShowToast] = useState<boolean>(false);

  // Live data state
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [primaryCase, setPrimaryCase] = useState<PurposeCase | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPurposeQueue()
      .then((data) => {
        setMetrics(data.metrics);
        setPrimaryCase(data.primaryCase);
        setQueueItems(data.queueItems);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2800);
  };

  const handleApprove = (_id: string, client: string, code: string) => {
    showToastMessage(`${client} validated under ${code} & lodged`);
  };

  const handleShowDetails = (ref: string) => {
    showToastMessage(`Viewing audit manifest for: ${ref}`);
  };

  return (
    <div className="flex flex-col w-full">
      {/* Page Header */}
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
          Purpose Adviser
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
          Review, verify, and approve RBI trade remittance classifications backed by dual-audited legal certainty.
        </p>
      </div>

      <div className="flex flex-col gap-space-lg px-space-base py-space-md">
        {/* Regulatory Co-Pilot Header */}
        <Reveal>
          <section className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <span className="flex h-2 w-2 rounded-full bg-primary-container animate-pulse" />
                <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider">
                  Regulatory Co-Pilot
                </span>
              </div>
              <div className="flex items-center gap-1 px-space-sm py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-code-sm text-code-sm">
                <span className="material-symbols-outlined text-[14px] text-tertiary">lock</span>
                <span>FEDAI \u2022 EDPMS v4.2</span>
              </div>
            </div>

            {/* Quick Status Strip */}
            <div className="flex items-center justify-between px-space-base py-space-sm rounded-xl bg-surface-container-low shadow-sm">
              <div className="flex items-center gap-space-xs text-tertiary">
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
                <span className="font-label-md text-label-md font-semibold text-on-surface">
                  RBI Master Direction
                </span>
              </div>
              <div className="flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm">
                <span>AI Precision:</span>
                <span className="font-code-sm text-code-sm text-primary font-bold">97.4%</span>
              </div>
            </div>

            {/* Summary Metric Counters */}
            <div className="grid grid-cols-2 gap-space-xs pt-space-2xs">
              {metrics.map((metric, index) => {
                const colorClass = metric.variant
                  ? `text-${metric.variant}`
                  : 'text-on-surface';

                return (
                  <Reveal key={metric.label} delay={index * 0.05}>
                    <div className="p-space-sm rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between">
                      <div className="flex items-center justify-between text-on-surface-variant">
                        <span className="font-label-sm text-label-sm">{metric.label}</span>
                        <span className="material-symbols-outlined text-[16px]">
                          {metric.icon}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-space-xs mt-space-xs">
                        <span className={`font-headline-md text-headline-md font-bold ${colorClass}`}>
                          {metric.value}
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          {metric.subtitle}
                        </span>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </section>
        </Reveal>

        {/* Priority Investigation Section */}
        {loading ? (
          <Reveal delay={0.2}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
              <p className="font-body-md text-body-md">Loading purpose queue…</p>
            </div>
          </Reveal>
        ) : error ? (
          <Reveal delay={0.2}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-error">
              <span className="material-symbols-outlined text-[40px]">error</span>
              <p className="font-body-md text-body-md">Error: {error}</p>
            </div>
          </Reveal>
        ) : primaryCase === null && queueItems.length === 0 ? (
          <Reveal delay={0.2}>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px]">task_alt</span>
              <p className="font-body-md text-body-md">No purpose codes pending review.</p>
            </div>
          </Reveal>
        ) : (
          <>
            {primaryCase && (
              <Reveal delay={0.2}>
                <section className="flex flex-col gap-space-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-primary text-[20px]">
                        troubleshoot
                      </span>
                      <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                        Priority Investigation
                      </span>
                    </div>
                    <span className="px-space-sm py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-bold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-error" />
                      Conflict Flagged
                    </span>
                  </div>

                  {/* Main Showcase Card */}
                  <PurposeRecommendationCard purposeCase={primaryCase} />
                </section>
              </Reveal>
            )}

            {/* Queue Section */}
            <Reveal delay={0.3}>
              <SuggestedPurposePanel
                queueItems={queueItems}
                onApprove={handleApprove}
                onShowDetails={handleShowDetails}
              />
            </Reveal>
          </>
        )}

        {/* Purpose Code Explorer */}
        <PurposeCodeExplorer
          references={purposeCodeReferences}
          version={regulatoryInfo.version}
          nodeId={regulatoryInfo.nodeId}
          syncTime={regulatoryInfo.syncTime}
        />
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-space-xs px-space-base py-space-sm bg-inverse-surface text-inverse-on-surface rounded-full shadow-xl transition-all duration-300 opacity-100 translate-y-0 pointer-events-auto">
          <span className="material-symbols-outlined text-[18px] text-tertiary-fixed">
            verified
          </span>
          <span className="font-label-md text-label-md">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default PurposeAdvisor;
