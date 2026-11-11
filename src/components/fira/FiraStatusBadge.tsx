import type { FiraStatusBadgeProps } from '../../types/fira';

const statusConfig: Record<string, { bg: string; text: string; dot?: string }> = {
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
  'unlinked': {
    bg: 'bg-[#FEF2F2]',
    text: 'text-[#991B1B]',
    dot: 'bg-error',
  },
};

function FiraStatusBadge({ status, label }: FiraStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig['pending-purpose'];

  return (
    <span
      className={`px-space-sm py-space-2xs rounded-full ${config.bg} ${config.text} font-label-sm text-label-sm font-semibold shrink-0`}
    >
      {label}
    </span>
  );
}

export default FiraStatusBadge;
