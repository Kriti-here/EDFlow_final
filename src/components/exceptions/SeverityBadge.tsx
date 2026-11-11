import type { ExceptionSeverity } from '../../types/exceptions';

interface SeverityBadgeProps {
  severity: ExceptionSeverity;
  count?: number | string;
  showDot?: boolean;
}

const severityConfig: Record<ExceptionSeverity, {
  containerClass: string;
  textClass: string;
  dotClass: string;
}> = {
  critical: {
    containerClass: 'bg-error-container',
    textClass: 'text-on-error-container',
    dotClass: 'bg-error',
  },
  high: {
    containerClass: 'bg-secondary-container',
    textClass: 'text-on-secondary-container',
    dotClass: 'bg-secondary',
  },
  medium: {
    containerClass: 'bg-surface-container-highest',
    textClass: 'text-primary',
    dotClass: 'bg-primary',
  },
  low: {
    containerClass: 'bg-surface-container',
    textClass: 'text-on-surface-variant',
    dotClass: 'bg-outline-variant',
  },
};

function SeverityBadge({ severity, count, showDot = true }: SeverityBadgeProps) {
  const config = severityConfig[severity];

  return (
    <span
      className={`px-2.5 py-0.5 rounded-full ${config.containerClass} ${config.textClass} font-label-sm text-label-sm font-semibold flex items-center gap-1`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />}
      {count !== undefined ? count : severity.toUpperCase()}
    </span>
  );
}

export default SeverityBadge;
