import type { ExceptionKpi } from '../../types/exceptions';
import Reveal from '../Reveal';

interface ExceptionsMetricsProps {
  metrics: ExceptionKpi[];
}

const severityToColor: Record<string, { container: string; text: string }> = {
  critical: { container: 'bg-error-container', text: 'text-error' },
  high: { container: 'bg-secondary-container', text: 'text-secondary' },
  medium: { container: 'bg-surface-container-highest', text: 'text-primary' },
  low: { container: 'bg-surface-container-lowest', text: 'text-on-surface' },
};

function ExceptionsMetrics({ metrics }: ExceptionsMetricsProps) {
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-space-sm">
      {metrics.map((metric, index) => {
        const color = severityToColor[metric.variant || 'low'];
        const Icon = () => (
          <span className="material-symbols-outlined text-[18px]">
            {metric.icon || 'info'}
          </span>
        );

        return (
          <Reveal key={metric.label} delay={index * 0.05}>
            <div className="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="font-label-sm text-label-sm font-semibold">
                  {metric.label}
                </span>
                {metric.icon && <Icon />}
              </div>
              <div className="flex items-baseline gap-space-xs mt-space-sm">
                <span
                  className={`font-headline-lg-mobile text-headline-lg-mobile font-bold ${
                    color ? color.text : 'text-on-surface'
                  }`}
                >
                  {metric.value}
                </span>
                {metric.subtitle && (
                  <span
                    className={`font-label-sm text-label-sm ${
                      color ? `${color.text}/80` : 'text-on-surface-variant'
                    }`}
                  >
                    {metric.subtitle}
                  </span>
                )}
              </div>
            </div>
          </Reveal>
        );
      })}
    </section>
  );
}

export default ExceptionsMetrics;
