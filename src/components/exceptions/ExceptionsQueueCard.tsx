import type { ExceptionSection } from '../../types/exceptions';

interface ExceptionsQueueCardProps {
  section: ExceptionSection;
  children: React.ReactNode;
}

const severityIndicator: Record<string, string> = {
  critical: 'bg-error',
  high: 'bg-secondary',
  medium: 'bg-primary',
  low: 'bg-tertiary',
};

function ExceptionsQueueCard({ section, children }: ExceptionsQueueCardProps) {
  const indicatorColor = severityIndicator[section.severity] || 'bg-outline';

  return (
    <section className="flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
          <span className={`w-2.5 h-2.5 rounded-full ${indicatorColor} animate-pulse`} />
          <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
            {section.title}
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm font-medium">
            {section.count} pending
          </span>
        </div>
        <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
          {section.subtitle}
        </span>
      </div>
      {children}
    </section>
  );
}

export default ExceptionsQueueCard;
