import MaterialIcon from '../landing/MaterialIcon';
import type { FiraDocumentRecord } from '../../services/firaService';
import FiraStatusBadge from './FiraStatusBadge';

export type FiraDocumentTableProps = {
  documents: FiraDocumentRecord[];
  /** Opens the extracted-lines view for one document. */
  onInspect: (document: FiraDocumentRecord) => void;
};

const STATUS_LABEL: Record<string, string> = {
  verified: 'Verified',
  needs_review: 'Needs Review',
  failed: 'Failed',
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

function statusIcon(status: string): string {
  if (status === 'verified') return 'verified_user';
  if (status === 'failed') return 'error';
  return 'help';
}

function statusIconClass(status: string): string {
  if (status === 'verified') return 'bg-surface-container text-primary';
  if (status === 'failed') return 'bg-error-container text-error';
  return 'bg-surface-container-high text-secondary';
}

/** "12 Nov 2026" from an ISO date or ISO datetime string. */
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

function periodLabel(document: FiraDocumentRecord): string {
  if (!document.statement_period_start && !document.statement_period_end) return '—';
  return `${humanDate(document.statement_period_start)} → ${humanDate(document.statement_period_end)}`;
}

function FiraDocumentTable({ documents, onInspect }: FiraDocumentTableProps) {
  return (
    <div className="flex flex-col gap-space-sm">
      {documents.map((doc) => (
        <FiraDocumentCard key={doc.id} document={doc} onInspect={onInspect} />
      ))}
    </div>
  );
}

function FiraDocumentCard({
  document,
  onInspect,
}: {
  document: FiraDocumentRecord;
  onInspect: (document: FiraDocumentRecord) => void;
}) {
  const title = document.fira_reference ?? document.file_name;
  const confidence =
    document.confidence_bp !== null ? `${(document.confidence_bp / 100).toFixed(1)}%` : '—';

  return (
    <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-lowest p-space-md shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex min-w-0 items-center gap-space-xs">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${statusIconClass(document.verification_status)}`}
          >
            <MaterialIcon name={statusIcon(document.verification_status)} className="text-[20px]" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-headline-sm text-headline-sm font-bold text-on-surface">
              {title}
            </span>
            <span className="truncate font-label-sm text-label-sm text-on-surface-variant">
              {document.bank_name ?? 'Bank not extracted'} • AD Code:{' '}
              {document.ad_code ?? '—'}
            </span>
          </div>
        </div>
        <FiraStatusBadge
          label={statusLabel(document.verification_status)}
          status={document.verification_status}
        />
      </div>

      <div className="flex flex-col gap-space-xs rounded-lg bg-surface-container-low p-space-sm">
        <div className="flex items-center justify-between">
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Statement Period
          </span>
          <span className="font-body-sm text-body-sm font-medium text-on-surface">
            {periodLabel(document)}
          </span>
        </div>
        <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
          <span>Lines Extracted</span>
          <span className="font-medium text-on-surface">{document.line_count ?? 0}</span>
        </div>
        <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
          <span>Pages · Extraction Confidence</span>
          <span className="font-medium text-on-surface">
            {document.page_count ?? '—'} · {confidence}
          </span>
        </div>
        <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
          <span>Content Hash</span>
          <span className="font-code-sm text-code-sm font-semibold text-on-surface">
            {document.sha256.slice(0, 12)}…
          </span>
        </div>
      </div>

      {document.is_synthetic && (
        <div className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
          <MaterialIcon name="info" className="text-[15px] text-secondary" />
          Synthetic sample document — not a real bank FIRA.
        </div>
      )}

      {document.issues.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg bg-error-container p-space-xs">
          {document.issues.map((issue) => (
            <li
              key={issue}
              className="flex items-start gap-1 font-body-sm text-body-sm text-on-error-container"
            >
              <MaterialIcon name="report_problem" className="mt-0.5 text-[15px] shrink-0" />
              {issue}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between pt-space-xs">
        <button
          className="flex items-center gap-space-2xs font-label-md text-label-md font-semibold text-primary transition-opacity hover:opacity-80"
          onClick={() => onInspect(document)}
          type="button"
        >
          <MaterialIcon name="visibility" className="text-[18px]" />
          <span>Inspect Certificate</span>
        </button>
        <span className="font-code-sm text-code-sm text-on-surface-variant">
          {humanDate(document.created_at)}
        </span>
      </div>
    </div>
  );
}

export default FiraDocumentTable;
