import Reveal from '../Reveal';

interface DispatchCardProps {
  title: string;
  description: string;
  buttonLabel: string;
  includes: string[];
}

function DispatchCard({ title, description, buttonLabel, includes }: DispatchCardProps) {
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
        <div className="pt-space-xs">
          <button
            className="w-full h-11 flex items-center justify-center gap-space-xs rounded-xl bg-surface-container-lowest text-on-surface font-headline-sm text-headline-sm font-semibold shadow-sm hover:bg-surface-container-high transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-primary text-[18px]">archive</span>
            <span>{buttonLabel}</span>
          </button>
        </div>
        <div className="flex items-center justify-center gap-space-sm text-center font-label-sm text-label-sm text-on-surface-variant">
          {includes.map((item, index) => (
            <span key={index}>
              {item}
              {index < includes.length - 1 && <span>\u2022</span>}
            </span>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

export default DispatchCard;
