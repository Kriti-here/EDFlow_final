/** Backend FIRA verification statuses plus the legacy UI-only values. */
export type FiraStatusBadgeProps = {
  status: string;
  label: string;
};

const statusConfig: Record<string, { bg: string; text: string; dot?: string }> = {
  verified: {
    bg: 'bg-[#ECFDF5]',
    text: 'text-[#065F46]',
    dot: 'bg-[#10B981]',
  },
  needs_review: {
    bg: 'bg-[#FFFBEB]',
    text: 'text-[#92400E]',
    dot: 'bg-[#F59E0B]',
  },
  failed: {
    bg: 'bg-[#FEF2F2]',
    text: 'text-[#991B1B]',
    dot: 'bg-error',
  },
  'fully-linked': {
    bg: 'bg-[#ECFDF5]',
    text: 'text-[#065F46]',
    dot: 'bg-[#10B981]',
  },
  'tolerated-discrepancy': {
    bg: 'bg-[#FFFBEB]',
    text: 'text-[#92400E]',
    dot: 'bg-[#F59E0B]',
  },
  'pending-purpose': {
    bg: 'bg-surface-container',
    text: 'text-primary',
    dot: 'bg-primary',
  },
  unlinked: {
    bg: 'bg-[#FEF2F2]',
    text: 'text-[#991B1B]',
    dot: 'bg-error',
  },
};

function FiraStatusBadge({ status, label }: FiraStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig['needs_review'];

  return (
    <span
      className={`px-space-sm py-space-2xs rounded-full ${config.bg} ${config.text} font-label-sm text-label-sm font-semibold shrink-0`}
    >
      {label}
    </span>
  );
}

export default FiraStatusBadge;
