import { useState } from 'react';
import type { PurposeCodeReference } from '../../types/purpose';
import Reveal from '../Reveal';

interface PurposeCodeExplorerProps {
  references: PurposeCodeReference[];
  /** Rules version from rules/india_export.yaml. */
  version: string;
  /** Where the catalogue was loaded from, e.g. rules/india_export.yaml. */
  sourcePath: string;
  /** Date the rules file was last updated. */
  lastUpdated: string;
  /** False while any rules entry is still marked unverified. */
  verified: boolean;
}

const colorMap: Record<string, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary',
  'on-surface': 'text-on-surface',
};

function PurposeCodeExplorer({
  references,
  version,
  sourcePath,
  lastUpdated,
  verified,
}: PurposeCodeExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.trim().toLowerCase();
  const filteredReferences = references.filter(
    (ref) =>
      query === '' ||
      ref.code.toLowerCase().includes(query) ||
      ref.label.toLowerCase().includes(query) ||
      ref.description.toLowerCase().includes(query),
  );
  const unverifiedCount = references.filter((ref) => ref.verified === false).length;

  return (
    <section className="flex flex-col gap-space-sm pt-space-xs mb-space-base">
      <Reveal delay={0.5}>
        <div className="p-space-base rounded-xl bg-surface-container-high flex flex-col gap-space-sm">
          <div className="flex items-start justify-between gap-space-sm">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-secondary text-[22px]">
                menu_book
              </span>
              <div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  RBI Purpose Code Index
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {references.length} codes loaded from {sourcePath}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-space-xs">
              {(unverifiedCount > 0 || !verified) && (
                <span className="px-space-xs py-0.5 rounded bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold">
                  {unverifiedCount > 0 ? `${unverifiedCount} unverified` : 'unverified'}
                </span>
              )}
              <span className="px-space-xs py-0.5 rounded bg-surface-container-lowest font-code-sm text-code-sm text-on-surface font-bold">
                {version}
              </span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative flex items-center w-full">
            <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              className="w-full h-10 pl-9 pr-space-base rounded-xl bg-surface-container-lowest text-on-surface font-body-sm text-body-sm placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
              placeholder="Search code or keywords (e.g., P0802, software, hosting)..."
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
                onClick={() => setSearchQuery(ref.code)}
                title={ref.description}
                type="button"
              >
                <span className={`font-bold ${colorMap[ref.color] || 'text-on-surface'}`}>
                  {ref.code}
                </span>
                <span>{ref.label}</span>
                {ref.verified === false && (
                  <span className="text-error font-bold" title="Marked unverified in the rules file">
                    *
                  </span>
                )}
              </button>
            ))}
            {filteredReferences.length === 0 && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No purpose code matches “{searchQuery}”.
              </p>
            )}
          </div>

          {/* Source stamps */}
          <div className="flex items-center justify-between gap-space-sm pt-space-xs mt-space-2xs text-on-surface-variant font-code-sm text-code-sm">
            <div className="flex items-center gap-1 min-w-0">
              <span className="material-symbols-outlined text-[15px] text-tertiary">
                fingerprint
              </span>
              <span className="truncate">Rules: {sourcePath}</span>
            </div>
            <span className="shrink-0">Last updated: {lastUpdated}</span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export default PurposeCodeExplorer;
