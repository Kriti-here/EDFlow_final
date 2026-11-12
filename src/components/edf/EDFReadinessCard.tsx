import type { ActiveCompilation } from '../../types/edf';
import Reveal from '../Reveal';

interface EDFReadinessCardProps {
  compilation: ActiveCompilation;
  onApprove?: () => void;
  busy?: boolean;
}

function EDFReadinessCard({ compilation, onApprove, busy = false }: EDFReadinessCardProps) {
  return (
    <Reveal delay={0.1}>
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary text-on-primary p-space-base shadow-md">
        <div className="relative z-10 flex flex-col gap-space-md">
          <div className="flex items-start justify-between gap-space-sm">
            <div className="flex flex-col">
              <div className="flex items-center gap-space-xs">
                <span className="inline-block w-2 h-2 rounded-full bg-secondary-fixed animate-ping" />
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary-fixed font-semibold">
                  Active Compilation
                </span>
              </div>
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-primary mt-1">
                Assembling Pack {compilation.packNumber}
              </h2>
              <p className="font-body-sm text-body-sm text-on-primary/80 mt-0.5">
                {compilation.client} • {compilation.description}
              </p>
            </div>
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-surface-container-lowest/15 backdrop-blur-md">
              <span className="material-symbols-outlined text-on-primary text-[22px] animate-spin">
                sync
              </span>
            </div>
          </div>

          {/* Progress Metrics Bar */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-label-sm text-label-sm text-on-primary">
              <span>Overall Verification Stage</span>
              <span className="font-code-sm text-code-sm font-bold">{compilation.overallProgress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-container-lowest/20 overflow-hidden">
              <div
                className="h-full bg-secondary-fixed rounded-full transition-all duration-500 ease-out"
                style={{ width: `${compilation.overallProgress}%` }}
              />
            </div>
          </div>

          {/* Assembly Checklist */}
          <div className="grid grid-cols-2 gap-space-xs py-space-xs">
            {compilation.checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5">
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    item.status === 'verified' ? 'text-secondary-fixed' : 'text-secondary-fixed-dim'
                  }`}
                >
                  {item.icon}
                </span>
                <span className="font-label-sm text-label-sm text-on-primary truncate">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          <button
            className="w-full h-11 flex items-center justify-center gap-space-xs rounded-xl bg-surface-container-lowest text-primary font-headline-sm text-headline-sm font-semibold active:scale-[0.99] transition-transform shadow-sm disabled:opacity-60 disabled:active:scale-100"
            type="button"
            onClick={onApprove}
            disabled={busy || !onApprove || !compilation.ready}
            title={
              compilation.ready
                ? 'Freeze this draft and store its SHA-256 snapshot hash'
                : 'Resolve the blocking failures above before approving'
            }
          >
            <span className="material-symbols-outlined text-[18px]">
              {busy ? 'sync' : 'verified'}
            </span>
            <span>
              {compilation.ready ? 'Approve & Seal Dossier' : 'Blocking failures prevent approval'}
            </span>
          </button>
        </div>

        {/* Decorative backdrop */}
        <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-surface-container-lowest/5 pointer-events-none" />
      </div>
    </Reveal>
  );
}

export default EDFReadinessCard;
