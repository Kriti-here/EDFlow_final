import MaterialIcon from '../landing/MaterialIcon';

export type FiraMetricsCardProps = {
  label: string;
  value: string;
  icon: string;
  subtitle: string;
  delta?: string;
  progress?: number;
};

function FiraMetricsCard({ label, value, icon, subtitle, delta, progress }: FiraMetricsCardProps) {
  return (
    <div className="flex flex-col p-space-md rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between text-on-surface-variant mb-space-2xs">
        <span className="font-label-sm text-label-sm font-medium tracking-wide">{label}</span>
        <div className="w-6 h-6 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
          <MaterialIcon name={icon} className="text-[15px]" />
        </div>
      </div>
      <div className="flex items-baseline gap-space-xs">
        <span className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">
          {value}
        </span>
        {delta && (
          <span className="font-label-sm text-label-sm text-tertiary font-semibold flex items-center">
            {delta}
          </span>
        )}
      </div>
      {progress !== undefined ? (
        <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-space-xs overflow-hidden">
          <div
            className="bg-tertiary h-full rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : (
        <p className="font-code-sm text-code-sm text-on-surface-variant mt-space-2xs">{subtitle}</p>
      )}
    </div>
  );
}

export default FiraMetricsCard;
