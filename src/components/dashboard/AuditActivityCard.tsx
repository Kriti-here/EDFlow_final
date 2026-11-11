import MaterialIcon from "../landing/MaterialIcon";

export type AuditActivityCardProps = {
  /** Ledger block reference, e.g. "BLOCK #829,104". */
  blockLabel: string;
  /** Truncated Merkle root hash. */
  rootHash: string;
  /** Validating witness line. */
  witness: string;
  /** Verification state label. */
  verifiedLabel: string;
  /** Anchoring sentence, ending in a colon before the timestamp. */
  detail: string;
  /** Anchored timestamp. */
  timestamp: string;
};

/**
 * Real-time cryptographic audit trail preview: latest anchored block, its
 * witness and the EDPMS anchor it was written against.
 */
function AuditActivityCard({
  blockLabel,
  rootHash,
  witness,
  verifiedLabel,
  detail,
  timestamp,
}: AuditActivityCardProps) {
  return (
    <div className="flex h-full flex-col gap-space-sm bg-surface-container-lowest p-space-md rounded-[20px] shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 card-hover">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <MaterialIcon name="fingerprint" className="text-[20px] text-secondary" />
          <span className="font-headline-sm text-headline-sm text-on-surface">
            Audit Ledger • Merkle Root
          </span>
        </div>
        <span className="font-code-sm text-code-sm font-medium text-on-surface-variant">LIVE</span>
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg bg-surface-container p-space-sm">
        <div className="flex items-center justify-between font-code-sm text-code-sm">
          <span className="text-on-surface-variant">{blockLabel}</span>
          <span className="truncate font-mono text-primary">{rootHash}</span>
        </div>

        <div className="flex items-center justify-between pt-0.5 font-label-sm text-label-sm">
          <span className="text-on-surface-variant">{witness}</span>
          <span className="flex items-center gap-1 font-medium text-emerald-800">
            <MaterialIcon name="verified" className="text-[13px] text-emerald-500" />
            {verifiedLabel}
          </span>
        </div>

        <p className="mt-1 font-code-sm text-code-sm leading-snug text-on-surface-variant">
          {detail} <span className="text-on-surface">{timestamp}</span>
        </p>
      </div>
    </div>
  );
}

export default AuditActivityCard;
