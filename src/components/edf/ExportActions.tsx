import Reveal from '../Reveal';

interface ExportActionsProps {
  status: string;
  onDownload: (format: string) => void;
  onSubmit?: () => void;
  onContinue?: () => void;
  onClearExceptions?: () => void;
  onRevalidate?: () => void;
  onPreview?: () => void;
}

function ExportActions({
  status,
  onDownload,
  onSubmit,
  onContinue,
  onClearExceptions,
  onRevalidate,
  onPreview,
}: ExportActionsProps) {
  if (status === 'ready') {
    return (
      <Reveal delay={0.3}>
        <div className="flex flex-col gap-space-sm pt-space-xs">
          <div className="grid grid-cols-3 gap-space-xs">
            <button
              className="h-9 px-space-xs flex items-center justify-center gap-1 rounded-lg bg-surface-container font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-colors"
              onClick={() => onDownload('DGFT JSON')}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">data_object</span>
              <span>DGFT JSON</span>
            </button>
            <button
              className="h-9 px-space-xs flex items-center justify-center gap-1 rounded-lg bg-surface-container font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-colors"
              onClick={() => onDownload('CSV Ledger')}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">table_view</span>
              <span>CSV Ledger</span>
            </button>
            <button
              className="h-9 px-space-xs flex items-center justify-center gap-1 rounded-lg bg-surface-container font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-colors"
              onClick={() => onDownload('RBI PDF')}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              <span>RBI PDF</span>
            </button>
          </div>
          <button
            className="w-full h-12 flex items-center justify-center gap-space-sm rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-semibold active:scale-[0.985] shadow-sm transition-all"
            onClick={onSubmit}
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
            <span>Submit Direct to EDPMS Gateway</span>
          </button>
        </div>
      </Reveal>
    );
  }

  if (status === 'blocked') {
    return (
      <Reveal delay={0.3}>
        <div className="flex flex-col sm:flex-row gap-space-xs pt-space-xs">
          <button
            className="flex-1 h-11 flex items-center justify-center gap-space-xs rounded-xl bg-surface-container-highest text-on-surface font-label-md text-label-md font-semibold hover:bg-surface-container-high transition-colors"
            onClick={onClearExceptions}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px] text-error">warning</span>
            <span>Clear in Exceptions Hub (2)</span>
          </button>
          <button
            className="h-11 px-space-md flex items-center justify-center gap-space-xs rounded-xl bg-surface-container text-on-surface-variant font-label-md text-label-md font-semibold hover:bg-surface-container-high transition-colors"
            onClick={onRevalidate}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">replay</span>
            <span>Re-validate</span>
          </button>
        </div>
      </Reveal>
    );
  }

  if (status === 'draft') {
    return (
      <Reveal delay={0.3}>
        <div className="flex items-center gap-space-sm pt-space-xs">
          <button
            className="flex-1 h-11 flex items-center justify-center gap-space-xs rounded-xl bg-primary text-on-primary font-label-md text-label-md font-semibold active:scale-[0.985] shadow-sm transition-all"
            onClick={onContinue}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">build</span>
            <span>Continue Assembly</span>
          </button>
          <button
            className="h-11 px-space-md flex items-center justify-center gap-space-xs rounded-xl bg-surface-container font-label-md text-label-md text-on-surface font-medium hover:bg-surface-container-high transition-colors"
            onClick={onPreview}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
            <span>Preview</span>
          </button>
        </div>
      </Reveal>
    );
  }

  if (status === 'exported') {
    return (
      <Reveal delay={0.3}>
        <div className="flex items-center justify-between gap-space-xs">
          <button
            className="flex-1 h-10 flex items-center justify-center gap-space-xs rounded-lg bg-surface-container font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-colors"
            onClick={() => onDownload('PDF Certificate')}
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">file_download</span>
            <span>PDF Certificate</span>
          </button>
          <button
            className="flex-1 h-10 flex items-center justify-center gap-space-xs rounded-lg bg-surface-container font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-colors"
            onClick={() => onDownload('Audit Chain')}
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">timeline</span>
            <span>Audit Chain</span>
          </button>
        </div>
      </Reveal>
    );
  }

  return null;
}

export default ExportActions;
