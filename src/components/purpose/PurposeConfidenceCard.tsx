import type { PurposeCase } from '../../types/purpose';
import Reveal from '../Reveal';

interface PurposeConfidenceCardProps {
  purposeCase: PurposeCase;
}

function PurposeConfidenceCard({ purposeCase }: PurposeConfidenceCardProps) {
  return (
    <Reveal delay={0.1}>
      <div className="p-space-base rounded-xl bg-primary/5 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 px-space-base py-1 rounded-bl-xl bg-primary text-on-primary font-label-sm text-label-sm font-bold flex items-center gap-1 shadow-sm">
          <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
          <span>{purposeCase.recommendedCode.confidence} Confidence</span>
        </div>
        <span className="font-label-sm text-label-sm text-primary uppercase font-bold tracking-wide">
          Recommended Purpose Code
        </span>
        <div className="flex items-baseline gap-space-sm mt-space-xs">
          <span className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-primary tracking-tight">
            {purposeCase.recommendedCode.code}
          </span>
          <span className="font-label-md text-label-md text-on-surface font-semibold">
            {purposeCase.recommendedCode.label}
          </span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm leading-relaxed">
          {purposeCase.recommendedCode.description}
        </p>
        <div className="flex items-center gap-space-xs mt-space-sm pt-space-xs text-on-surface-variant font-code-sm text-code-sm">
          <span className="material-symbols-outlined text-[16px] text-secondary">balance</span>
          <span className="truncate">RBI Circular RBI/2016-17/146 \u2022 DGFT FTP Para 2.05</span>
        </div>
      </div>
    </Reveal>
  );
}

export default PurposeConfidenceCard;
