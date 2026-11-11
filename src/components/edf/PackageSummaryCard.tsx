import type { EDFPack } from '../../types/edf';
import Reveal from '../Reveal';

interface PackageSummaryCardProps {
  pack: EDFPack;
}

function PackageSummaryCard({ pack }: PackageSummaryCardProps) {
  const statusConfig: Record<string, { container: string; text: string; dot: string }> = {
    ready: {
      container: 'bg-[#ECFDF5]',
      text: 'text-[#065F46]',
      dot: 'bg-[#10B981]',
    },
    draft: {
      container: 'bg-[#FFFBEB]',
      text: 'text-[#92400E]',
      dot: 'bg-[#F59E0B]',
    },
    blocked: {
      container: 'bg-[#FEF2F2]',
      text: 'text-[#991B1B]',
      dot: 'bg-[#EF4444]',
    },
    exported: {
      container: 'bg-surface-container',
      text: 'text-on-surface',
      dot: 'bg-secondary',
    },
  };

  const config = statusConfig[pack.status] || statusConfig.draft;

  return (
    <Reveal>
      <div className="flex flex-col rounded-xl bg-surface-container-lowest p-space-base shadow-sm gap-space-md">
        {/* Header */}
        <div className="flex items-start justify-between gap-space-sm">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-space-xs flex-wrap">
              <span className="font-code-sm text-code-sm text-primary font-bold">
                {pack.packNumber}
              </span>
              <span className="w-1 h-1 rounded-full bg-outline-variant" />
              <span className="font-body-md text-body-md font-semibold text-on-surface truncate">
                {pack.title}
              </span>
            </div>
            <div className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
              {pack.invoiceCount} ({pack.invoiceRefs.join(', ')})
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1 px-space-sm py-space-xs rounded-full ${config.container} ${config.text} font-label-sm text-label-sm shrink-0`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
            <span>
              {pack.status === 'ready' ? 'READY FOR LODGEMENT' : 
               pack.status === 'blocked' ? 'BLOCKED' :
               pack.status === 'draft' ? 'DRAFTING' : 'FILED & SEALED'}
            </span>
          </span>
        </div>

        {/* Telemetry Panel */}
        <div className="flex flex-col gap-space-xs p-space-sm rounded-xl bg-surface-container-low">
          <div className="flex items-baseline justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              Declared Value
            </span>
            <div className="flex items-baseline gap-space-xs">
              <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                {pack.value}
              </span>
              {pack.valueInr && (
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  ({pack.valueInr})
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="flex flex-col gap-1 mt-1">
            <div className="flex items-center justify-between font-label-sm text-label-sm">
              <span className="text-on-surface-variant">
                {pack.status === 'exported' ? 'Lodgement Status' : 'Reconciliation & Compliance Integrity'}
              </span>
              <span
                className={`font-bold ${
                  pack.status === 'ready' ? 'text-[#065F46]' :
                  pack.status === 'blocked' ? 'text-error' :
                  pack.status === 'draft' ? 'text-primary-container' : 'text-on-surface'
                }`}
              >
                {pack.validationProgress}% {pack.validationLabel}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-container-high overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  pack.status === 'ready' ? 'bg-[#10B981]' :
                  pack.status === 'blocked' ? 'bg-error' :
                  pack.status === 'draft' ? 'bg-primary-container' : 'bg-secondary'
                }`}
                style={{ width: `${pack.validationProgress}%` }}
              />
            </div>
          </div>

          {/* Purpose Codes */}
          {pack.purposeCodes && pack.purposeCodes.length > 0 && (
            <div className="flex items-center gap-space-xs flex-wrap mt-space-xs pt-space-xs">
              {pack.purposeCodes.map((code, index) => (
                <span
                  key={index}
                  className="px-space-xs py-0.5 rounded bg-surface-container-highest font-code-sm text-code-sm text-on-surface font-medium"
                >
                  {code}
                </span>
              ))}
              {pack.aiConfidence && (
                <span className="font-label-sm text-label-sm text-[#065F46] ml-auto font-medium flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                  AI Confidence {pack.aiConfidence}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Validation Results / Block Alert */}
        {pack.complianceChecks && pack.complianceChecks.length > 0 && (
          <div className="flex flex-col gap-1.5 py-0.5">
            {pack.complianceChecks.map((check) => (
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
        )}

        {pack.exceptions && pack.exceptions.length > 0 && (
          <div className="flex flex-col gap-space-xs p-space-sm rounded-xl bg-[#FEF2F2] text-[#991B1B]">
            <div className="flex items-center gap-space-xs font-label-sm text-label-sm font-bold">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{pack.exceptions.length} Unresolved Regulatory Exceptions</span>
            </div>
            <ul className="flex flex-col gap-1 text-on-surface font-body-sm text-body-sm pl-6 list-disc">
              {pack.exceptions.map((exception, index) => (
                <li key={index}>
                  <span className="font-medium text-error">{exception.split(':')[0]}:</span>
                  {exception.split(':').slice(1).join(':')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sign-off Audit Rail */}
        {pack.signOffs && pack.signOffs.length > 0 && (
          <div className="flex items-center justify-between p-space-xs rounded-lg bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant">
            {pack.signOffs.map((signOff, index) => (
              <div key={index} className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-[#10B981]">
                  {signOff.icon}
                </span>
                <span>{signOff.role} {signOff.status === 'signed' ? 'Signed' : signOff.status === 'verified' ? 'Verified' : signOff.status === 'active' ? 'Seal Active' : signOff.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Lodgement Receipt (for exported packs) */}
        {pack.status === 'exported' && (
          <div className="flex flex-col gap-space-xs p-space-sm rounded-xl bg-surface-container-low font-code-sm text-code-sm">
            <div className="flex items-center justify-between text-on-surface">
              <span className="text-on-surface-variant">Value Lodged</span>
              <span className="font-bold text-on-surface font-headline-sm text-headline-sm">
                {pack.value}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-on-surface-variant">EDPMS Ack No.</span>
              <span className="font-semibold text-primary">{pack.edpmsAck}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">Merkle SHA-256</span>
              <span className="text-on-surface-variant truncate max-w-[160px]">
                {pack.merkleHash}
              </span>
            </div>
          </div>
        )}

        {/* Message */}
        {pack.message && pack.status === 'draft' && (
          <div className="flex items-center gap-space-sm p-space-sm rounded-xl bg-surface-container-low font-body-sm text-body-sm text-on-surface">
            <span className="material-symbols-outlined text-primary-container text-[20px] shrink-0">
              psychology
            </span>
            <span>{pack.message}</span>
          </div>
        )}
      </div>
    </Reveal>
  );
}

export default PackageSummaryCard;
