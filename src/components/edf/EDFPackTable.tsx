import type { EDFPack, EDFPackExportFormat, EdfPackAction } from '../../types/edf';
import PackageSummaryCard from './PackageSummaryCard';
import Reveal from '../Reveal';

interface EDFPackTableProps {
  packs: EDFPack[];
  activeFilter: string;
  onAction?: (pack: EDFPack, action: EdfPackAction) => void;
  onExport?: (pack: EDFPack, format: EDFPackExportFormat) => void;
  busyId?: string | null;
}

function EDFPackTable({ packs, activeFilter, onAction, onExport, busyId }: EDFPackTableProps) {
  const filteredPacks = activeFilter === 'all'
    ? packs
    : packs.filter(pack => pack.status === activeFilter);

  if (filteredPacks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-space-xl gap-space-xs text-on-surface-variant">
        <span className="material-symbols-outlined text-[36px]">filter_alt_off</span>
        <p className="font-body-md text-body-md">No packs in this column.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-base" id="packs-container">
      {filteredPacks.map((pack, index) => (
        <Reveal key={pack.id} delay={index * 0.05}>
          <div className={`pack-card ${pack.status}`}>
            <PackageSummaryCard
              pack={pack}
              onAction={onAction}
              onExport={onExport}
              busy={busyId === pack.id}
            />
          </div>
        </Reveal>
      ))}
    </div>
  );
}

export default EDFPackTable;
