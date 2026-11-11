import { useState } from 'react';
import type { PurposeCodeReference } from '../../types/purpose';
import Reveal from '../Reveal';

interface PurposeCodeExplorerProps {
  references: PurposeCodeReference[];
  version: string;
  nodeId: string;
  syncTime: string;
}

const colorMap: Record<string, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary',
  'on-surface': 'text-on-surface',
};

function PurposeCodeExplorer({ references, version, nodeId, syncTime }: PurposeCodeExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredReferences = references.filter(ref => {
    const query = searchQuery.toLowerCase();
    return (
      ref.code.toLowerCase().includes(query) ||
      ref.label.toLowerCase().includes(query) ||
      ref.description.toLowerCase().includes(query) ||
      query === ''
    );
  });

  return (
    <section className="flex flex-col gap-space-sm pt-space-xs mb-space-base">
      <Reveal delay={0.5}>
        <div className="p-space-base rounded-xl bg-surface-container-high flex flex-col gap-space-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-secondary text-[22px]">
                menu_book
              </span>
              <div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  RBI Purpose Code Index
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Master Direction (Inward Services updated 2024)
                </p>
              </div>
            </div>
            <span className="px-space-xs py-0.5 rounded bg-surface-container-lowest font-code-sm text-code-sm text-on-surface font-bold">
              {version}
            </span>
          </div>

          {/* Search Bar */}
          <div className="relative flex items-center w-full">
            <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              className="w-full h-10 pl-9 pr-space-base rounded-xl bg-surface-container-lowest text-on-surface font-body-sm text-body-sm placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
              placeholder="Search code or keywords (e.g., P0802, Royalties, SaaS)..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Quick Code Reference Pills */}
          <div className="flex flex-wrap gap-1.5 pt-space-2xs">
            {filteredReferences.map((ref) => (
              <button
                key={ref.code}
                className="px-space-sm py-1 rounded-lg bg-surface-container-lowest font-code-sm text-code-sm text-on-surface hover:bg-surface-container transition-colors flex items-center gap-1"
              >
                <span className={`font-bold ${colorMap[ref.color] || 'text-on-surface'}`}>
                  {ref.code}
                </span>
                <span>{ref.label}</span>
              </button>
            ))}
          </div>

          {/* Regulatory Anchor Stamp */}
          <div className="flex items-center justify-between pt-space-xs mt-space-2xs text-on-surface-variant font-code-sm text-code-sm">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-tertiary">
                fingerprint
              </span>
              <span>Node ID: {nodeId}</span>
            </div>
            <span>EDPMS Sync: {syncTime}</span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export default PurposeCodeExplorer;
