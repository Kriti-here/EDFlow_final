import { useRef, useState } from 'react';
import MaterialIcon from '../landing/MaterialIcon';
import { errorMessage } from '../../services/api';
import { uploadFiraDocument, type FiraDocumentRecord } from '../../services/firaService';

export type FiraUploadCardProps = {
  /** Called with the stored document once the backend has extracted it. */
  onUploaded: (document: FiraDocumentRecord) => void;
};

/** Upload dropzone. Posts the PDF to `POST /fira/documents` as multipart/form-data. */
function FiraUploadCard({ onUploaded }: FiraUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (file: File | undefined) => {
    if (!file || busy) return;
    setFailure(null);
    setBusy(true);
    try {
      onUploaded(await uploadFiraDocument(file));
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-space-2xs rounded-xl p-space-lg text-center shadow-sm transition-all ${
        dragging ? 'bg-primary-fixed' : 'bg-surface-container-low hover:bg-surface-container'
      } ${busy ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
      onClick={() => {
        if (!busy) inputRef.current?.click();
      }}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void submit(event.dataTransfer.files?.[0]);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!busy) inputRef.current?.click();
        }
      }}
    >
      <input
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(event) => void submit(event.currentTarget.files?.[0])}
        ref={inputRef}
        type="file"
      />
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-lowest text-primary shadow-sm">
        <MaterialIcon
          name={busy ? 'progress_activity' : 'document_scanner'}
          className={`text-[28px] ${busy ? 'animate-spin' : ''}`}
        />
      </div>
      <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
        {busy ? 'Extracting FIRA…' : '+ Upload Bank FIRA / MT103 Advice'}
      </span>
      <p className="mt-space-2xs max-w-xs font-body-sm text-body-sm text-on-surface-variant">
        Drop a bank FIRA PDF or Swift advisory note. The backend extracts the UTR,
        remitter, purpose code and inward amounts, then verifies them.
      </p>
      {failure && (
        <p className="mt-space-2xs flex max-w-md items-start gap-1 rounded-lg bg-error-container p-space-xs text-left font-body-sm text-body-sm text-on-error-container">
          <MaterialIcon name="error" className="mt-0.5 text-[16px] shrink-0" />
          {failure}
        </p>
      )}
      <div className="mt-space-sm flex items-center gap-space-md font-code-sm text-code-sm text-on-surface-variant">
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
