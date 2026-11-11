import { useState } from 'react';
import type { ResolvedException } from '../../types/exceptions';
import Reveal from '../Reveal';

interface ResolutionPanelProps {
  resolvedExceptions: ResolvedException[];
  totalResolved: number;
}

function ResolutionPanel({ resolvedExceptions, totalResolved }: ResolutionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <section className="flex flex-col gap-space-sm">
      <button
        onClick={toggleExpand}
        className="flex items-center justify-between p-space-md rounded-xl bg-surface-container-lowest shadow-sm hover:bg-surface-container-low transition-colors text-left"
      >
        <div className="flex items-center gap-space-sm">
          <div className="w-8 h-8 rounded-full bg-[#ECFDF5] text-[#065F46] flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                Resolved Today
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#065F46] font-label-sm text-label-sm font-semibold">
                {totalResolved} items
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Cleared and ready for EDPMS batch upload
            </p>
          </div>
        </div>
        <span
          className={`material-symbols-outlined text-on-surface-variant text-[24px] transform transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      {isExpanded && (
        <div className="flex flex-col gap-space-xs transition-all duration-300">
          {resolvedExceptions.map((exception, index) => (
            <Reveal key={exception.id} delay={index * 0.05}>
              <div className="p-space-md rounded-xl bg-surface-container-lowest/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
                <div className="flex items-center gap-space-sm">
                  <span className="material-symbols-outlined text-tertiary text-[20px]">
                    task_alt
                  </span>
                  <div>
                    <span className="font-code-sm text-code-sm font-bold text-on-surface">
                      {exception.invoiceRef}
                    </span>
                    <span className="text-on-surface-variant font-body-sm text-body-sm">
                      \u2022 {exception.amount}
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {exception.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-space-xs pl-8 sm:pl-0">
                  <span
                    className={`px-2 py-0.5 rounded-full ${
                      exception.resolutionType === 'auto'
                        ? 'bg-[#ECFDF5] text-[#065F46]'
                        : 'bg-surface-container text-on-surface-variant'
                    } font-label-sm text-label-sm font-medium`}
                  >
                    {exception.resolutionType === 'auto' ? 'AI Auto-Rule' : 'Manual Auth'}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {exception.timestamp}
                  </span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}

export default ResolutionPanel;
