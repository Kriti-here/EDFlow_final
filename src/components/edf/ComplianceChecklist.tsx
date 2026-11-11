import type { ComplianceCheck } from '../../types/edf';
import Reveal from '../Reveal';

interface ComplianceChecklistProps {
  checks: ComplianceCheck[];
  title?: string;
}

function ComplianceChecklist({ checks, title = 'Validation Results' }: ComplianceChecklistProps) {
  return (
    <Reveal delay={0.2}>
      <div className="flex flex-col gap-1.5 py-0.5">
        {title && (
          <span className="font-label-sm text-label-sm text-on-surface-variant mb-space-xs">
            {title}
          </span>
        )}
        {checks.map((check) => (
          <div
            key={check.id}
            className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface"
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                check.status === 'verified' ? 'text-[#10B981]' :
                check.status === 'error' ? 'text-error' : 'text-on-surface-variant'
              }`}
            >
              {check.icon}
            </span>
            <span>{check.label}</span>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

export default ComplianceChecklist;
