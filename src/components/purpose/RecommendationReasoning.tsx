import type { PurposeCase } from '../../types/purpose';
import Reveal from '../Reveal';

interface RecommendationReasoningProps {
  purposeCase: PurposeCase;
}

function RecommendationReasoning({ purposeCase }: RecommendationReasoningProps) {
  return (
    <Reveal delay={0.15}>
      <div className="p-space-base rounded-xl bg-surface-container flex flex-col gap-space-xs relative overflow-hidden">
        <div className="flex items-center gap-space-xs text-primary">
          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
          <span className="font-label-sm text-label-sm font-bold uppercase tracking-wide">
            AI Reasoning ({purposeCase.aiEngine})
          </span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
          {purposeCase.aiSuggestion}
        </p>
        <div className="flex items-center gap-space-xs mt-space-xs pt-space-xs text-on-surface-variant font-code-sm text-code-sm">
          <span className="material-symbols-outlined text-[16px] text-secondary">balance</span>
          <span className="truncate">
            RBI Circular RBI/2016-17/146 \u2022 DGFT FTP Para 2.05
          </span>
        </div>
        <div className="absolute top-0 right-0 px-space-base py-1 rounded-bl-xl bg-primary text-on-primary font-label-sm text-label-sm font-bold flex items-center gap-1 shadow-sm">
          <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
          <span>{purposeCase.aiConfidence} Confidence</span>
        </div>
      </div>
    </Reveal>
  );
}

export default RecommendationReasoning;
