import React from 'react';
import { useCountUp } from '../../hooks/useCountUp';

interface HeroKPICardProps {
  className?: string;
}

export const HeroKPICard: React.FC<HeroKPICardProps> = ({ className = '' }) => {
  const finesCount = useCountUp(0);
  const checksCount = useCountUp(1248);

  return (
    <div
      className={`p-space-lg rounded-2xl bg-gradient-to-br from-primary-container to-error-container text-on-primary shadow-xl relative overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-space-sm mb-space-md">
          <span className="material-symbols-outlined text-[28px] text-white/90">gavel</span>
          <span className="font-label-md text-label-md font-bold tracking-widest uppercase text-white/90">
            FEMA Defensibility
          </span>
        </div>

        <div className="flex flex-wrap items-baseline gap-space-md mb-space-sm">
          <span className="font-headline-xl text-headline-xl font-bold text-white">
            {finesCount} Fines
          </span>
          <span className="font-headline-md text-headline-md text-white/80">
            &middot; 100% RBI Inquiry Defense
          </span>
        </div>

        <p className="font-body-lg text-body-lg text-white/70">
          <span className="font-bold text-white">{checksCount}</span> remittance checks processed with zero penalties
        </p>

        <div className="mt-space-md pt-space-md border-t border-white/20 flex items-center gap-space-md text-white/80">
          <span className="material-symbols-outlined text-[20px]">verified</span>
          <span className="font-body-sm text-body-sm">Statutory EDPMS & DGFT Audits Compliant</span>
        </div>
      </div>
    </div>
  );
};

export default HeroKPICard;
