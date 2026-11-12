import type { QueueItem } from '../../types/purpose';
import Reveal from '../Reveal';

interface SuggestedPurposePanelProps {
  queueItems: QueueItem[];
  /** Accept one proposal (commits the code onto the invoice). */
  onAccept: (recommendationId: string) => void;
  /** Reject one proposal. */
  onReject: (recommendationId: string) => void;
  /** Accept every high-confidence proposal in one pass. */
  onBatchAccept: (recommendationIds: string[]) => void;
  /** Recommendation currently awaiting a response. */
  busyId: string | null;
  /** True while the batch accept is running. */
  batchBusy: boolean;
}

/** Confidence thresholds are presentation only; the score itself is the backend's. */
const HIGH_CONFIDENCE = 95;
const MEDIUM_CONFIDENCE = 90;

// Written as whole class strings so Tailwind keeps them in the build output.
const BAND_STYLES = {
  high: { chip: 'bg-tertiary text-on-tertiary', dot: 'bg-tertiary', text: 'text-tertiary' },
  medium: { chip: 'bg-primary text-on-primary', dot: 'bg-primary', text: 'text-primary' },
  low: { chip: 'bg-secondary text-on-secondary', dot: 'bg-secondary', text: 'text-secondary' },
} as const;

function bandFor(aiFit: string): keyof typeof BAND_STYLES {
  const percentage = Number.parseFloat(aiFit);
  if (!Number.isFinite(percentage)) return 'low';
  if (percentage >= HIGH_CONFIDENCE) return 'high';
  if (percentage >= MEDIUM_CONFIDENCE) return 'medium';
  return 'low';
}

function SuggestedPurposePanel({
  queueItems,
  onAccept,
  onReject,
  onBatchAccept,
  busyId,
  batchBusy,
}: SuggestedPurposePanelProps) {
  const highConfidence = queueItems.filter((item) => bandFor(item.aiFit) === 'high');

  return (
    <section className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between gap-space-sm flex-wrap">
        <div>
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
            Queue in Waiting
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {queueItems.length} proposal{queueItems.length === 1 ? '' : 's'} awaiting a decision
          </p>
        </div>
        <button
          className="px-space-sm py-1 rounded-xl bg-surface-container font-label-sm text-label-sm text-primary font-bold hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={batchBusy || highConfidence.length === 0}
          onClick={() => onBatchAccept(highConfidence.map((item) => item.id))}
          type="button"
        >
          {batchBusy
            ? 'Accepting…'
            : `Accept all ≥${HIGH_CONFIDENCE}% (${highConfidence.length})`}
        </button>
      </div>

      <div className="flex flex-col gap-space-sm">
        {queueItems.map((item, index) => {
          const band = BAND_STYLES[bandFor(item.aiFit)];
          const busy = busyId === item.id;

          return (
            <Reveal key={item.id} delay={index * 0.05}>
              <div
                className={`p-space-base rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm ${
                  busy ? 'opacity-60 pointer-events-none' : ''
                }`}
                id={`queue-item-${index}`}
              >
                <div className="flex items-start justify-between gap-space-sm">
                  <div>
                    <div className="flex items-center flex-wrap gap-space-xs">
                      <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-surface-container text-on-surface font-semibold">
                        {item.invoiceRef}
                      </span>
                      <span className={`font-label-sm text-label-sm ${band.text} font-bold flex items-center gap-0.5`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${band.dot}`} />
                        {item.aiFit} confidence
                      </span>
                    </div>
                    <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface mt-1">
                      {item.client}
                    </h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {[item.location, item.bankTag].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                  {item.amount && (
                    <div className="text-right shrink-0">
                      <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                        {item.amount}
                      </span>
                      <span className="block font-code-sm text-code-sm text-on-surface-variant">
                        {item.currency}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-space-sm rounded-xl bg-surface-container-low flex items-center justify-between gap-space-sm">
                  <div className="flex items-center gap-space-sm min-w-0">
                    <span className={`font-code-sm text-code-sm font-bold px-1.5 py-0.5 rounded shrink-0 ${band.chip}`}>
                      {item.recommendedCode.code}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-md text-label-md text-on-surface font-semibold truncate">
                        {item.recommendedCode.label}
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                        {item.recommendedCode.description}
                      </span>
                    </div>
                  </div>
                  {item.recommendedCode.verified === false && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold">
                      unverified
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-space-xs">
                  <button
                    className="flex-1 h-10 rounded-xl bg-surface-container-highest text-on-surface font-label-md text-label-md font-semibold flex items-center justify-center gap-1 shadow-sm hover:bg-surface-container-high active:scale-[0.98] disabled:opacity-50"
                    disabled={busy}
                    onClick={() => onAccept(item.id)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {bandFor(item.aiFit) === 'high' ? 'verified' : 'check'}
                    </span>
                    <span>Accept {item.recommendedCode.code}</span>
                  </button>
                  <button
                    aria-label={`Reject ${item.recommendedCode.code} for ${item.invoiceRef}`}
                    className="w-10 h-10 rounded-xl bg-surface-container text-on-surface-variant flex items-center justify-center hover:bg-error-container hover:text-on-error-container transition-colors disabled:opacity-50"
                    disabled={busy}
                    onClick={() => onReject(item.id)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">block</span>
                  </button>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export default SuggestedPurposePanel;
