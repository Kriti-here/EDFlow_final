import type { PurposeCase } from '../../types/purpose';
import Reveal from '../Reveal';

interface PurposeRecommendationCardProps {
  purposeCase: PurposeCase;
  /** Accept the proposal: commits the code onto the invoice. */
  onAccept?: (recommendationId: string) => void;
  /** Reject the proposal: nothing is written to the invoice. */
  onReject?: (recommendationId: string) => void;
  /** True while a decision on this recommendation is in flight. */
  busy?: boolean;
}

function PurposeRecommendationCard({
  purposeCase,
  onAccept,
  onReject,
  busy = false,
}: PurposeRecommendationCardProps) {
  const { recommendedCode } = purposeCase;
  const direction = (purposeCase.direction ?? '').split(' ');

  return (
    <div className="rounded-xl bg-surface-container-lowest shadow-md overflow-hidden flex flex-col transition-all duration-300">
      {/* Header Banner */}
      <div className="p-space-base bg-surface-container-low flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-surface-container-high text-on-surface font-semibold">
              {purposeCase.invoiceRef}
            </span>
            {purposeCase.nostroRef && (
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Nostro: {purposeCase.nostroRef}
              </span>
            )}
          </div>
          {direction.length === 2 && (
            <div className="flex items-center gap-1 text-on-surface font-code-sm text-code-sm font-bold">
              <span>{direction[0]}</span>
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                arrow_forward
              </span>
              <span>{direction[1]}</span>
            </div>
          )}
        </div>

        <div className="flex items-baseline justify-between mt-space-2xs">
          <div>
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              {purposeCase.client}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {[purposeCase.location, purposeCase.bank].filter(Boolean).join(' • ')}
            </p>
          </div>
          {purposeCase.amount && (
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
          )}
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

      {/* Recommended Purpose Code */}
      <Reveal delay={0.1}>
        <div className="m-space-base mt-0 p-space-base rounded-xl bg-primary/5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 px-space-base py-1 rounded-bl-xl bg-primary text-on-primary font-label-sm text-label-sm font-bold flex items-center gap-1 shadow-sm">
            <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
            <span>{recommendedCode.confidence} Confidence</span>
          </div>
          <span className="font-label-sm text-label-sm text-primary uppercase font-bold tracking-wide">
            Recommended Purpose Code
          </span>
          <div className="flex items-baseline flex-wrap gap-space-sm mt-space-xs">
            <span className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-primary tracking-tight">
              {recommendedCode.code}
            </span>
            <span className="font-label-md text-label-md text-on-surface font-semibold">
              {recommendedCode.label}
            </span>
            {recommendedCode.verified === false && (
              <span className="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold">
                unverified
              </span>
            )}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm leading-relaxed">
            {purposeCase.aiSuggestion}
          </p>
          {purposeCase.regulatoryReference && (
            <div className="flex items-center gap-space-xs mt-space-sm pt-space-xs text-on-surface-variant font-code-sm text-code-sm">
              <span className="material-symbols-outlined text-[16px] text-secondary">balance</span>
              <span className="truncate">{purposeCase.regulatoryReference}</span>
            </div>
          )}
        </div>
      </Reveal>

      {/* Alternative Codes */}
      <Reveal delay={0.2}>
        <div className="flex flex-col gap-space-xs p-space-base pt-0">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold">
              Alternatives Considered
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {purposeCase.alternativeCodes.length} candidates
            </span>
          </div>
          {purposeCase.alternativeCodes.length === 0 && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              The adviser scored only one code above its threshold for this invoice.
            </p>
          )}
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
              <span className="font-code-sm text-code-sm text-on-surface-variant font-medium shrink-0">
                {code.confidence}
              </span>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Matched keyword evidence */}
      {purposeCase.evidence.length > 0 && (
        <Reveal delay={0.3}>
          <div className="flex flex-col gap-space-xs p-space-base pt-0">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold">
              Matched Description Keywords
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
                    <span className="font-label-md text-label-md font-semibold text-on-surface">
                      {evidence.title}
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 break-words">
                      {evidence.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {/* Action CTA Hub */}
      <Reveal delay={0.4}>
        <div
          className={`flex flex-col gap-space-xs p-space-base pt-0 ${busy ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <button
            className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm font-semibold flex items-center justify-center gap-space-xs shadow-md hover:bg-primary/95 active:scale-[0.985] transition-all disabled:opacity-60"
            disabled={busy || !onAccept}
            onClick={() => onAccept?.(purposeCase.id)}
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            <span>Accept {recommendedCode.code} for {purposeCase.invoiceRef}</span>
          </button>
          <button
            className="h-10 rounded-xl bg-error-container text-on-error-container font-label-md text-label-md font-semibold flex items-center justify-center gap-1 hover:bg-error-container/80 transition-colors disabled:opacity-60"
            disabled={busy || !onReject}
            onClick={() => onReject?.(purposeCase.id)}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">block</span>
            <span>Reject proposal</span>
          </button>
          <div className="flex items-center justify-center gap-space-xs text-on-surface-variant font-code-sm text-code-sm mt-space-2xs">
            <span className="material-symbols-outlined text-[14px]">shield</span>
            <span className="truncate">
              Accepting writes the code to the invoice and records an audit entry
            </span>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

export default PurposeRecommendationCard;
