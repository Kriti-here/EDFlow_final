import type { PurposeCase } from '../../types/purpose';
import Reveal from '../Reveal';

interface PurposeRecommendationCardProps {
  purposeCase: PurposeCase;
}

function PurposeRecommendationCard({ purposeCase }: PurposeRecommendationCardProps) {
  return (
    <div className="rounded-xl bg-surface-container-lowest shadow-md overflow-hidden flex flex-col transition-all duration-300">
      {/* Header Banner */}
      <div className="p-space-base bg-surface-container-low flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-surface-container-high text-on-surface font-semibold">
              {purposeCase.invoiceRef}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              Nostro: {purposeCase.nostroRef}
            </span>
          </div>
          <div className="flex items-center gap-1 text-on-surface font-code-sm text-code-sm font-bold">
            <span>{purposeCase.direction.split(' ')[0]}</span>
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
              arrow_forward
            </span>
            <span>{purposeCase.direction.split(' ')[1]}</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between mt-space-2xs">
          <div>
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              {purposeCase.client}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {purposeCase.location} \u2022 {purposeCase.bank}
            </p>
          </div>
          <div className="text-right">
            <div className="font-headline-sm text-headline-sm font-bold text-primary">
              {purposeCase.amount}
            </div>
            {purposeCase.amountUsd && (
              <div className="font-code-sm text-code-sm text-on-surface-variant">
                {purposeCase.amountUsd}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Discrepancy Callout */}
      {purposeCase.discrepancy && (
        <div className="p-space-base flex flex-col gap-space-sm">
          <div className="flex items-start gap-space-sm p-space-sm rounded-xl bg-error-container/40">
            <span className="material-symbols-outlined text-[20px] text-error mt-0.5">
              notification_important
            </span>
            <div className="flex flex-col">
              <span className="font-label-md text-label-md font-bold text-error">
                {purposeCase.discrepancy.title}
              </span>
              <p className="font-body-sm text-body-sm text-on-error-container mt-0.5">
                {purposeCase.discrepancy.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AI Recommended Purpose Code */}
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
            {purposeCase.aiSuggestion}
          </p>
          <div className="flex items-center gap-space-xs mt-space-sm pt-space-xs text-on-surface-variant font-code-sm text-code-sm">
            <span className="material-symbols-outlined text-[16px] text-secondary">balance</span>
            <span className="truncate">RBI Circular RBI/2016-17/146 \u2022 DGFT FTP Para 2.05</span>
          </div>
        </div>
      </Reveal>

      {/* Alternative Codes */}
      <Reveal delay={0.2}>
        <div className="flex flex-col gap-space-xs p-space-base pt-0">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold">
              Alternative Codes Analyzed
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {purposeCase.alternativeCodes.length} Candidates
            </span>
          </div>
          {purposeCase.alternativeCodes.map((code) => (
            <div
              key={code.code}
              className="p-space-sm rounded-xl bg-surface-container flex items-center justify-between"
            >
              <div className="flex items-center gap-space-sm min-w-0">
                <div className="px-space-xs py-0.5 rounded bg-surface-container-high font-code-sm text-code-sm font-bold text-on-surface">
                  {code.code}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-label-md text-label-md text-on-surface truncate">
                    {code.label}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                    {code.description}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-space-xs">
                <span className="font-code-sm text-code-sm text-on-surface-variant font-medium">
                  {code.confidence}
                </span>
                <button
                  className="px-space-sm py-1 rounded-lg bg-surface-container-highest text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high transition-colors"
                >
                  Select
                </button>
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Forensic Evidence Chain */}
      <Reveal delay={0.3}>
        <div className="flex flex-col gap-space-xs p-space-base pt-0">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold">
            Forensic Evidence Chain
          </span>
          <div className="grid grid-cols-1 gap-space-xs">
            {purposeCase.evidence.map((evidence) => (
              <div
                key={evidence.id}
                className="p-space-sm rounded-xl bg-surface-container-low flex items-start gap-space-sm"
              >
                <div className="w-7 h-7 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0 text-primary">
                  <span className="material-symbols-outlined text-[16px]">{evidence.icon}</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-label-md text-label-md font-semibold text-on-surface">
                      {evidence.title}
                    </span>
                    {evidence.matchPercentage && (
                      <span className="font-label-sm text-label-sm text-tertiary font-bold">
                        {evidence.matchPercentage} Match
                      </span>
                    )}
                    {evidence.status === 'verified' && (
                      <span className="font-label-sm text-label-sm text-tertiary font-bold">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    {evidence.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Action CTA Hub */}
      <Reveal delay={0.4}>
        <div className="flex flex-col gap-space-xs p-space-base pt-0">
          <button className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm font-semibold flex items-center justify-center gap-space-xs shadow-md hover:bg-primary/95 active:scale-[0.985] transition-all">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            <span>Accept AI Classification ({purposeCase.recommendedCode.code})</span>
          </button>
          <div className="grid grid-cols-2 gap-space-xs">
            <button className="h-10 rounded-xl bg-surface-container text-on-surface font-label-md text-label-md font-semibold flex items-center justify-center gap-1 hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-[18px]">tune</span>
              <span>Select Manual</span>
            </button>
            <button className="h-10 rounded-xl bg-error-container text-on-error-container font-label-md text-label-md font-semibold flex items-center justify-center gap-1 hover:bg-error-container/80 transition-colors">
              <span className="material-symbols-outlined text-[18px]">forward_to_inbox</span>
              <span>Escalate to CA</span>
            </button>
          </div>
          <div className="flex items-center justify-center gap-space-xs text-on-surface-variant font-code-sm text-code-sm mt-space-2xs">
            <span className="material-symbols-outlined text-[14px]">shield</span>
            <span className="truncate">SHA-256 immutable ledger seal attached on commit</span>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

export default PurposeRecommendationCard;
