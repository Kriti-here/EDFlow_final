import { useCallback, useEffect, useRef, useState } from 'react';
import MaterialIcon from '../landing/MaterialIcon';
import { errorMessage } from '../../services/api';
import {
  fetchFiraDocument,
  type FiraDocumentRecord,
  type FiraLineRecord,
} from '../../services/firaService';
import { formatMoney, parseMoney } from '../../services/dashboardService';
import FiraStatusBadge from './FiraStatusBadge';

export type FiraInspectModalProps = {
  /** Id of the document to inspect, or `null` to keep the dialog closed. */
  documentId: number | null;
  onClose: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  verified: 'Verified',
  needs_review: 'Needs Review',
  failed: 'Failed',
};

function humanDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** "USD 1,234.00" from decimal text, without ever touching a float. */
function money(amount: string | null, currency: string | null): string {
  if (!amount) return '—';
  return `${currency ?? ''} ${formatMoney(parseMoney(amount))}`.trim();
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      <span className="truncate font-body-sm text-body-sm font-medium text-on-surface">{value}</span>
    </div>
  );
}

function LineCard({ line }: { line: FiraLineRecord }) {
  const confidence =
    line.confidence_bp !== null ? `${(line.confidence_bp / 100).toFixed(1)}%` : '—';
  return (
    <div className="flex flex-col gap-space-xs rounded-lg bg-surface-container-low p-space-sm">
      <div className="flex items-center justify-between gap-space-xs">
        <span className="font-label-md text-label-md font-semibold text-on-surface">
          Line {line.line_no ?? '—'}
        </span>
        <FiraStatusBadge
          label={STATUS_LABEL[line.verification_status] ?? line.verification_status}
          status={line.verification_status}
        />
      </div>
      <div className="grid grid-cols-2 gap-space-sm sm:grid-cols-3">
        <Fact label="Value Date" value={humanDate(line.value_date)} />
        <Fact label="UTR" value={line.utr ?? '—'} />
        <Fact label="Remitter" value={line.remitter_name ?? '—'} />
        <Fact label="Country" value={line.remitter_country ?? '—'} />
        <Fact label="Gross" value={money(line.gross_amount, line.currency)} />
        <Fact label="Bank Charges" value={money(line.bank_charges, line.currency)} />
        <Fact label="Net (INR)" value={line.net_amount_inr ?? '—'} />
        <Fact label="Purpose Code" value={line.purpose_code ?? 'Not mapped'} />
        <Fact label="Invoice Ref" value={line.invoice_reference ?? '—'} />
        <Fact label="Confidence" value={confidence} />
      </div>
      {line.issues.length > 0 && (
        <ul className="flex flex-col gap-1">
          {line.issues.map((issue) => (
            <li
              className="flex items-start gap-1 font-body-sm text-body-sm text-error"
              key={issue}
            >
              <MaterialIcon name="report_problem" className="mt-0.5 text-[15px] shrink-0" />
              {issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Detail dialog that loads one FIRA document with its extracted lines. */
function FiraInspectModal({ documentId, onClose }: FiraInspectModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [record, setRecord] = useState<FiraDocumentRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (documentId === null) return;
    setLoading(true);
    setError(null);
    try {
      setRecord(await fetchFiraDocument(documentId));
    } catch (err) {
      setRecord(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (documentId === null) {
      setRecord(null);
      setError(null);
      return;
    }
    void load();
  }, [documentId, load]);

  useEffect(() => {
    if (documentId === null) return;
    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [documentId, onClose]);

  if (documentId === null) return null;

  const lines = record?.lines ?? [];
  const confidence =
    record?.confidence_bp != null ? `${(record.confidence_bp / 100).toFixed(1)}%` : '—';

  return (
    <div
      className="invoice-modal-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-space-base"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-modal="true"
        aria-labelledby="fira-inspect-title"
        className="invoice-modal-panel flex max-h-[90vh] w-full max-w-3xl flex-col gap-space-base overflow-y-auto rounded-t-2xl bg-surface-container-lowest p-space-base shadow-2xl sm:rounded-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-space-sm">
          <div className="flex min-w-0 items-center gap-space-xs">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
              <MaterialIcon name="document_scanner" className="text-[20px]" />
            </div>
            <div className="min-w-0">
              <h2
                className="truncate font-headline-sm text-headline-sm font-bold text-on-surface"
                id="fira-inspect-title"
              >
                {record?.fira_reference ?? record?.file_name ?? 'FIRA document'}
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Extracted statement lines stored for this document
              </p>
            </div>
          </div>
          <button
            aria-label="Close dialog"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <MaterialIcon name="close" className="text-[20px]" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-space-xs p-space-xl">
            <MaterialIcon
              name="progress_activity"
              className="animate-spin text-[24px] text-primary"
            />
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Loading extracted lines…
            </span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-space-sm rounded-xl bg-error-container p-space-lg text-center">
            <p className="font-body-sm text-body-sm text-on-error-container">{error}</p>
            <button
              className="rounded-lg bg-primary px-space-base py-space-xs font-label-sm text-label-sm font-semibold text-on-primary"
              onClick={() => void load()}
              type="button"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && record && (
          <>
            <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-low p-space-md">
              <div className="flex items-center justify-between gap-space-xs">
                <span className="truncate font-body-sm text-body-sm text-on-surface-variant">
                  {record.bank_name ?? 'Bank not extracted'} • AD Code:{' '}
                  {record.ad_code ?? '—'}
                </span>
                <FiraStatusBadge
                  label={STATUS_LABEL[record.verification_status] ?? record.verification_status}
                  status={record.verification_status}
                />
              </div>
              <div className="grid grid-cols-2 gap-space-sm sm:grid-cols-3">
                <Fact
                  label="Statement Period"
                  value={`${humanDate(record.statement_period_start)} → ${humanDate(record.statement_period_end)}`}
                />
                <Fact label="Generated On" value={humanDate(record.generated_on)} />
                <Fact label="Pages" value={record.page_count?.toString() ?? '—'} />
                <Fact label="Extraction Confidence" value={confidence} />
                <Fact label="Source" value={record.source ?? '—'} />
                <Fact label="Uploaded" value={humanDate(record.created_at)} />
              </div>
              <Fact label="SHA-256" value={record.sha256} />
              {record.is_synthetic && (
                <p className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                  <MaterialIcon name="info" className="text-[15px] text-secondary" />
                  Synthetic sample document — not a real bank FIRA.
                </p>
              )}
              {record.issues.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-lg bg-error-container p-space-xs">
                  {record.issues.map((issue) => (
                    <li
                      className="flex items-start gap-1 font-body-sm text-body-sm text-on-error-container"
                      key={issue}
                    >
                      <MaterialIcon name="report_problem" className="mt-0.5 text-[15px] shrink-0" />
                      {issue}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {lines.length === 0 ? (
              <p className="rounded-xl bg-surface-container-low p-space-lg text-center font-body-sm text-body-sm text-on-surface-variant">
                No statement lines were extracted from this document.
              </p>
            ) : (
              <div className="flex flex-col gap-space-sm">
                <h3 className="font-label-md text-label-md font-semibold text-on-surface">
                  Extracted Lines ({lines.length})
                </h3>
                {lines.map((line) => (
                  <LineCard key={line.id} line={line} />
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex justify-end">
          <button
            className="rounded-lg px-space-base py-2 font-label-md text-label-md font-semibold text-on-surface-variant hover:bg-surface-container"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

export default FiraInspectModal;
