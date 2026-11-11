import type { EDFPack } from '../../types/edf';
import PackageSummaryCard from './PackageSummaryCard';
import Reveal from '../Reveal';

interface EDFPackTableProps {
  packs: EDFPack[];
  activeFilter: string;
}

function EDFPackTable({ packs, activeFilter }: EDFPackTableProps) {
  const filteredPacks = activeFilter === 'all'
    ? packs
    : packs.filter(pack => pack.status === activeFilter);

  return (
    <div className="flex flex-col gap-space-base" id="packs-container">
      {filteredPacks.map((pack, index) => (
        <Reveal key={pack.id} delay={index * 0.05}>
          <div className={`pack-card ${pack.status}`}>
            <PackageSummaryCard pack={pack} />
          </div>
        </Reveal>
      ))}
    </div>
  );
}

export default EDFPackTable;
