import MaterialIcon from '../landing/MaterialIcon';

function FiraUploadCard() {
  return (
    <div className="relative group flex flex-col items-center justify-center p-space-lg rounded-xl bg-surface-container-low shadow-sm hover:bg-surface-container transition-all cursor-pointer text-center">
      <div className="w-12 h-12 rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-center text-primary group-hover:scale-110 transition-transform mb-space-xs">
        <MaterialIcon name="document_scanner" className="text-[28px]" />
      </div>
      <div className="flex items-center gap-space-xs">
        <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
          + Upload Bank FIRA / MT103 Advice
        </span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-2xs max-w-xs">
        Drag & drop bank PDF or swift advisory note. Instant neural OCR extracts Purpose Code,
        Inward Nostro FX & UTR.
      </p>
      <div className="flex items-center gap-space-md mt-space-sm text-on-surface-variant font-code-sm text-code-sm">
        <span className="flex items-center gap-1">
          <MaterialIcon name="check" className="text-[14px] text-tertiary" />
          EDPMS V.2
        </span>
        <span className="flex items-center gap-1">
          <MaterialIcon name="check" className="text-[14px] text-tertiary" />
          MT103 / MT202
        </span>
        <span className="flex items-center gap-1">
          <MaterialIcon name="check" className="text-[14px] text-tertiary" />
          Digital DSC
        </span>
      </div>
    </div>
  );
}

export default FiraUploadCard;
