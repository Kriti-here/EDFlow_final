import type { EDFPackExportFormat } from '../../types/edf';
import Reveal from '../Reveal';

const FORMATS: Array<{ format: EDFPackExportFormat; label: string; icon: string }> = [
  { format: 'json', label: 'JSON snapshot', icon: 'data_object' },
  { format: 'csv', label: 'CSV worksheet', icon: 'table_view' },
  { format: 'pdf', label: 'PDF worksheet', icon: 'picture_as_pdf' },
];

interface DispatchCardProps {
  title: string;
  description: string;
  includes: string[];
  onExport?: (format: EDFPackExportFormat) => void;
  disabled?: boolean;
}

function DispatchCard({ title, description, includes, onExport, disabled = false }: DispatchCardProps) {
  return (
    <Reveal delay={0.4}>
      <div className="flex flex-col p-space-base rounded-xl bg-surface-container-low gap-space-sm">
        <div className="flex items-center gap-space-xs text-on-surface">
          <span className="material-symbols-outlined text-primary-container text-[20px]">
            verified_user
          </span>
          <h3 className="font-headline-sm text-headline-sm font-bold">{title}</h3>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{description}</p>
        <div className="grid grid-cols-3 gap-space-xs pt-space-xs">
          {FORMATS.map(({ format, label, icon }) => (
            <button
              key={format}
              className="h-11 flex flex-col items-center justify-center gap-0.5 rounded-xl bg-surface-container-lowest text-on-surface font-label-sm text-label-sm font-semibold shadow-sm hover:bg-surface-container-high transition-colors disabled:opacity-50"
              onClick={() => onExport?.(format)}
              disabled={disabled || !onExport}
              type="button"
            >
              <span className="material-symbols-outlined text-primary text-[18px]">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-space-sm text-center font-label-sm text-label-sm text-on-surface-variant flex-wrap">
          {includes.map((item, index) => (
            <span key={index}>
              {item}
              {index < includes.length - 1 && <span> • </span>}
            </span>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

export default DispatchCard;
