import type { QueueItem } from '../../types/purpose';
import Reveal from '../Reveal';

interface SuggestedPurposePanelProps {
  queueItems: QueueItem[];
  onApprove: (id: string, client: string, code: string) => void;
  onShowDetails: (ref: string) => void;
}

const getStatusColor = (aiFit: string) => {
  const percentage = parseFloat(aiFit);
  if (percentage >= 95) return 'tertiary';
  if (percentage >= 90) return 'primary';
  return 'secondary';
};

function SuggestedPurposePanel({ queueItems, onApprove, onShowDetails }: SuggestedPurposePanelProps) {
  return (
    <section className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
            Queue in Waiting
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {queueItems.length} additional trade remittances require verification
          </p>
        </div>
        <button
          className="px-space-sm py-1 rounded-xl bg-surface-container font-label-sm text-label-sm text-primary font-bold hover:bg-surface-container-high"
        >
          Batch Approve ({queueItems.filter(i => parseFloat(i.aiFit) >= 95).length})
        </button>
      </div>

      <div className="flex flex-col gap-space-sm">
        {queueItems.map((item, index) => {
          const statusColor = getStatusColor(item.aiFit);
          const colorClasses = {
            primary: 'bg-primary text-on-primary',
            secondary: 'bg-secondary text-on-secondary',
            tertiary: 'bg-tertiary text-on-tertiary',
          };

          return (
            <Reveal key={item.id} delay={index * 0.05}>
              <div
                className="p-space-base rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm"
                id={`queue-item-${index}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-space-xs">
                      <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-surface-container text-on-surface font-semibold">
                        {item.invoiceRef}
                      </span>
                      <span
                        className={`font-label-sm text-label-sm text-${statusColor} font-bold flex items-center gap-0.5`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full bg-${statusColor}`} />
                        {item.aiFit} AI Fit
                      </span>
                    </div>
                    <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface mt-1">
                      {item.client}
                    </h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {item.location} \u2022 {item.bankTag}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                      {item.amount}
                    </span>
                    <span className="block font-code-sm text-code-sm text-on-surface-variant">
                      {item.currency} Remittance
                    </span>
                  </div>
                </div>

                <div className="p-space-sm rounded-xl bg-surface-container-low flex items-center justify-between">
                  <div className="flex items-center gap-space-sm">
                    <span
                      className={`font-code-sm text-code-sm font-bold px-1.5 py-0.5 rounded ${
                        colorClasses[statusColor] || 'bg-surface-container text-on-surface'
                      }`}
                    >
                      {item.recommendedCode.code}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">
                        {item.recommendedCode.label}
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {item.recommendedCode.description}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-space-xs">
                  <button
                    onClick={() => onApprove(item.id, item.client, item.recommendedCode.code)}
                    className="flex-1 h-10 rounded-xl bg-surface-container-highest text-on-surface font-label-md text-label-md font-semibold flex items-center justify-center gap-1 shadow-sm hover:bg-surface-container-high active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {parseFloat(item.aiFit) >= 95 ? 'verified' : 'check'}
                    </span>
                    <span>
                      {parseFloat(item.aiFit) >= 95
                        ? `One-Tap Approve ${item.recommendedCode.code}`
                        : `Verify & Lodgement (${item.recommendedCode.code})`}
                    </span>
                  </button>
                  <button
                    onClick={() => onShowDetails(`${item.client} - ${item.invoiceRef}`)}
                    className="w-10 h-10 rounded-xl bg-surface-container text-on-surface-variant flex items-center justify-center hover:bg-surface-container-high"
                  >
                    <span className="material-symbols-outlined text-[18px]">more_horiz</span>
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
