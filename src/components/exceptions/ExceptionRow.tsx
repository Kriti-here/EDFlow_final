import type { ExceptionItem } from '../../types/exceptions';
import SeverityBadge from './SeverityBadge';
import Reveal from '../Reveal';

interface ExceptionRowProps {
  exception: ExceptionItem;
  onResolve: (id: string, message: string) => void;
  onSecondaryAction: (id: string, action: string) => void;
}

function ExceptionRow({ exception, onResolve, onSecondaryAction }: ExceptionRowProps) {
  const handlePrimaryAction = () => {
    onResolve(exception.id, exception.actions.primary.onClick);
  };

  const handleSecondaryAction = () => {
    if (exception.actions.secondary) {
      onSecondaryAction(exception.id, exception.actions.secondary.onClick);
    }
  };

  return (
    <Reveal>
      <article
        className="exception-card flex flex-col p-space-base rounded-xl bg-surface-container-lowest shadow-sm gap-space-md transition-all duration-200"
        data-category={exception.categories.join(' ')}
        data-search={exception.id}
      >
        {/* Header */}
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-start justify-between gap-space-sm">
            <div className="flex flex-wrap items-center gap-space-xs">
              <SeverityBadge severity={exception.severity} />
              <span className="font-code-sm text-code-sm text-on-surface-variant font-medium">
                {exception.code}
              </span>
              <span className="text-outline-variant">\u2022</span>
              <span className="font-code-sm text-code-sm text-primary font-semibold">
                {exception.invoiceRef}
              </span>
            </div>
            {exception.deadline && (
              <span className="font-label-sm text-label-sm text-error bg-error-container/40 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">timer</span>
                {exception.deadline}
              </span>
            )}
            {!exception.deadline && (
              <span className="font-label-sm text-label-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded font-medium">
                {exception.timestamp}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-1">
            <div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                {exception.title}
              </h3>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {exception.country} ({exception.currency})
              </span>
            </div>
            <div className="text-right">
              <div className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">
                {exception.amount}
              </div>
              {exception.amountUsd && (
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  {exception.amountUsd}
                </span>
              )}
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {exception.amountUsd ? 'Foreign inward remittance' : 'Inward Nostro Remittance'}
              </span>
            </div>
          </div>
        </div>

        {/* Problem Statement */}
        {exception.problemDetails && (
          <div className="p-space-sm rounded-xl bg-surface-container-low flex items-start gap-space-sm text-on-surface">
            <span className="material-symbols-outlined text-[20px] text-error shrink-0 mt-0.5">
              warning
            </span>
            <div className="flex flex-col">
              <span className="font-label-md text-label-md font-semibold">
                {exception.problemDetails.title}
              </span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {exception.problemDetails.description}
              </p>
            </div>
          </div>
        )}

        {/* AI Recommendation */}
        {exception.aiRecommendation && (
          <div className="p-space-md rounded-xl bg-surface-container flex flex-col gap-space-xs relative overflow-hidden">
            <div className="flex items-center gap-space-xs text-primary">
              <span className="material-symbols-outlined text-[18px]">psychology_alt</span>
              <span className="font-label-sm text-label-sm font-bold tracking-wide uppercase">
                AI Recommendation ({exception.aiRecommendation.engine})
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface">
              {exception.aiRecommendation.suggestion}
            </p>
          </div>
        )}

        {/* Compliance Info */}
        {exception.complianceInfo && (
          <div className="p-space-md rounded-xl bg-surface-container flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs text-primary">
              <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
              <span className="font-label-sm text-label-sm font-bold uppercase tracking-wide">
                {exception.complianceInfo.title}
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface">
              {exception.complianceInfo.description}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs">
          {exception.bankInfo && (
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {exception.bankInfo}
            </span>
          )}
          {exception.shippingBill && (
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {exception.shippingBill}
            </span>
          )}
          <div className="flex items-center gap-space-xs w-full sm:w-auto">
            <button
              onClick={handlePrimaryAction}
              className="flex-1 sm:flex-initial h-10 px-space-base rounded-xl bg-primary-container text-on-primary font-label-md text-label-md font-semibold hover:bg-primary transition-all flex items-center justify-center gap-1 shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">
                {exception.actions.primary.icon}
              </span>
              <span>{exception.actions.primary.label}</span>
            </button>
            {exception.actions.secondary && (
              <button
                onClick={handleSecondaryAction}
                className="h-10 px-space-base rounded-xl bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold hover:bg-surface-container transition-colors"
              >
                {exception.actions.secondary.label}
              </button>
            )}
          </div>
        </div>
      </article>
    </Reveal>
  );
}

export default ExceptionRow;
