import { useState, useEffect } from 'react';
import Reveal from '../components/Reveal';
import {
  FiraUploadCard,
  FiraDocumentTable,
  FiraMetricsCard,
  FiraValidationCard,
  FiraActionBar,
} from '../components/fira';
import { firaMetrics, bankNodes, filterTabs, syncStatus, bankIngestionStatus } from '../data/fira';
import { fetchFiraDocuments } from '../services/firaService';
import type { FiraDocument } from '../types/fira';

function FiraDocuments() {
  const [activeTab] = useState('All');

  const updatedTabs = filterTabs.map(tab => ({
    ...tab,
    active: tab.label === activeTab,
  }));

  const [documents, setDocuments] = useState<FiraDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFiraDocuments()
      .then((data) => {
        setDocuments(data as any);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex flex-col w-full">
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
          Fira Documents
        </h1>
      </div>

      <div className="flex flex-col w-full gap-space-base px-space-base pb-space-xl">
        {/* Real-Time Reconciliation Banner */}
        <Reveal>
          <div className="flex items-center justify-between px-space-md py-space-xs rounded-xl bg-surface-container-low text-on-surface shadow-sm">
            <div className="flex items-center gap-space-xs min-w-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-tertiary" />
              </span>
              <p className="font-label-sm text-label-sm text-on-surface-variant truncate">
                {syncStatus.message} • {syncStatus.rate}
              </p>
            </div>
            <div className="flex items-center gap-space-2xs text-primary font-label-sm text-label-sm font-semibold shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
              <span className="material-symbols-outlined text-[15px]">sync</span>
              <span>Sync Nostro</span>
            </div>
          </div>
        </Reveal>

        {/* Top Metrics Bento Strip */}
        <Reveal delay={0.1}>
          <div className="grid grid-cols-2 gap-space-sm">
            {firaMetrics.map((metric) => (
              <FiraMetricsCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                icon={metric.icon}
                subtitle={metric.subtitle}
                delta={metric.delta}
                progress={metric.progress}
              />
            ))}
          </div>
        </Reveal>

        {/* Bank Ingestion Connector */}
        <Reveal delay={0.2}>
          <FiraValidationCard
            title={bankIngestionStatus.title}
            status={bankIngestionStatus.status}
            banks={bankNodes}
          />
        </Reveal>

        {/* Upload Dropzone */}
        <Reveal delay={0.3}>
          <FiraUploadCard />
        </Reveal>

        {/* Filter Tabs */}
        <Reveal delay={0.4}>
          <FiraActionBar tabs={updatedTabs} />
        </Reveal>

        {/* Search Input */}
        <Reveal delay={0.5}>
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
              search
            </span>
            <input
              className="w-full h-11 pl-11 pr-space-md rounded-xl bg-surface-container-lowest text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant shadow-sm focus:outline-none focus:bg-surface-container-lowest"
              placeholder="Search by FIRA Ref, Swift MT103, Remitter, or UTR..."
              type="text"
            />
          </div>
        </Reveal>

        {/* FIRA Records Stream */}
        {loading ? (
          <Reveal delay={0.6}>
            <p className="text-center">Loading FIRA documents...</p>
          </Reveal>
        ) : error ? (
          <Reveal delay={0.6}>
            <p className="text-center text-error">Error: {error}</p>
          </Reveal>
        ) : documents.length === 0 ? (
          <Reveal delay={0.6}>
            <p className="text-center">No FIRA documents found.</p>
          </Reveal>
        ) : (
          <Reveal delay={0.6}>
            <FiraDocumentTable documents={documents} />
          </Reveal>
        )}
      </div>
    </div>
  );
}

export default FiraDocuments;
