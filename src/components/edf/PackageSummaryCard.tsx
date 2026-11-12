import type { EDFPack, EDFPackExportFormat, EdfPackAction } from '../../types/edf';
import Reveal from '../Reveal';

interface PackageSummaryCardProps {
  pack: EDFPack;
  onAction?: (pack: EDFPack, action: EdfPackAction) => void;
  onExport?: (pack: EDFPack, format: EDFPackExportFormat) => void;
  busy?: boolean;
}

const EXPORT_FORMATS: Array<{ format: EDFPackExportFormat; label: string }> = [
  { format: 'json', label: 'JSON' },
  { format: 'csv', label: 'CSV' },
  { format: 'pdf', label: 'PDF' },
];

function PackageSummaryCard({ pack, onAction, onExport, busy = false }: PackageSummaryCardProps) {
  const statusConfig: Record<string, { container: string; text: string; dot: string; label: string }> = {
    ready: {
      container: 'bg-[#ECFDF5]',
      text: 'text-[#065F46]',
      dot: 'bg-[#10B981]',
      label: 'APPROVED — READY TO DOWNLOAD',
    },
    draft: {
      container: 'bg-[#FFFBEB]',
      text: 'text-[#92400E]',
      dot: 'bg-[#F59E0B]',
      label: 'DRAFTING',
    },
    blocked: {
      container: 'bg-[#FEF2F2]',
      text: 'text-[#991B1B]',
      dot: 'bg-[#EF4444]',
      label: 'BLOCKED',
    },
    exported: {
      container: 'bg-surface-container',
      text: 'text-on-surface',
      dot: 'bg-secondary',
      label: 'EXPORTED',
    },
    void: {
      container: 'bg-surface-container-high',
      text: 'text-on-surface-variant',
      dot: 'bg-outline',
      label: 'REVOKED',
    },
  };

  const config = statusConfig[pack.status] ?? statusConfig.draft;
  const canApprove = pack.status === 'draft' && pack.ready === true;
  const canRevoke = pack.status === 'ready' || pack.status === 'exported';

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
              {pack.client} • {pack.invoiceCount}
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1 px-space-sm py-space-xs rounded-full ${config.container} ${config.text} font-label-sm text-label-sm shrink-0`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
            <span>{config.label}</span>
          </span>
        </div>

        {/* Telemetry Panel */}
        <div className="flex flex-col gap-space-xs p-space-sm rounded-xl bg-surface-container-low">
          <div className="flex items-baseline justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              Declared Value (INR)
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
              <span className="text-on-surface-variant">Completeness checks</span>
              <span
                className={`font-bold ${
                  pack.status === 'ready' ? 'text-[#065F46]' :
                  pack.status === 'blocked' ? 'text-error' :
                  pack.status === 'draft' ? 'text-primary-container' : 'text-on-surface'
                }`}
              >
                {pack.validationProgress}% · {pack.validationLabel}
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
              <span>{pack.exceptions.length} Blocking Validation Failures</span>
            </div>
            <ul className="flex flex-col gap-1 text-on-surface font-body-sm text-body-sm pl-6 list-disc">
              {pack.exceptions.map((exception, index) => (
                <li key={index}>{exception}</li>
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

        {/* Approval Receipt (hash stamped at approval) */}
        {pack.merkleHash && (
          <div className="flex flex-col gap-space-xs p-space-sm rounded-xl bg-surface-container-low font-code-sm text-code-sm">
            <div className="flex items-center justify-between text-on-surface">
              <span className="text-on-surface-variant">Approved Snapshot SHA-256</span>
              <span className="font-semibold text-primary truncate max-w-[60%]" title={pack.merkleHash}>
                {pack.merkleHash}
              </span>
            </div>
            {pack.lodgedDate && (
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">Exported</span>
                <span className="text-on-surface-variant">
                  {new Date(pack.lodgedDate).toLocaleString()}
                </span>
              </div>
            )}
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

        {/* Lifecycle actions */}
        {(pack.status === 'draft' || pack.status === 'blocked' || canRevoke) && (
          <div className="flex flex-col sm:flex-row gap-space-xs pt-space-xs border-t border-outline-variant/40">
            {(pack.status === 'draft' || pack.status === 'blocked') && (
              <button
                className="flex-1 h-10 flex items-center justify-center gap-1.5 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md font-semibold hover:bg-surface-container-high transition-colors disabled:opacity-50"
                onClick={() => onAction?.(pack, 'validate')}
                disabled={busy || !onAction}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">checklist</span>
                <span>Re-run checks</span>
              </button>
            )}
            {canApprove && (
              <button
                className="flex-1 h-10 flex items-center justify-center gap-1.5 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md font-semibold hover:bg-primary transition-colors disabled:opacity-50"
                onClick={() => onAction?.(pack, 'approve')}
                disabled={busy || !onAction}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">verified</span>
                <span>Approve &amp; seal</span>
              </button>
            )}
            {(pack.status === 'ready' || pack.status === 'exported') && (
              <div className="flex-1 grid grid-cols-3 gap-1.5">
                {EXPORT_FORMATS.map(({ format, label }) => (
                  <button
                    key={format}
                    className="h-10 flex items-center justify-center gap-1 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md font-semibold hover:bg-surface-container-high transition-colors disabled:opacity-50"
                    onClick={() => onExport?.(pack, format)}
                    disabled={!onExport}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
            {canRevoke && (
              <button
                className="h-10 px-space-md flex items-center justify-center gap-1.5 rounded-lg bg-surface-container text-on-surface-variant font-label-md text-label-md font-semibold hover:bg-surface-container-high transition-colors disabled:opacity-50"
                onClick={() => onAction?.(pack, 'revoke')}
                disabled={busy || !onAction}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">undo</span>
                <span>Revoke</span>
              </button>
            )}
          </div>
        )}

        {busy && (
          <div className="flex items-center justify-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
            <span>Working…</span>
          </div>
        )}
      </div>
    </Reveal>
  );
}

export default PackageSummaryCard;
