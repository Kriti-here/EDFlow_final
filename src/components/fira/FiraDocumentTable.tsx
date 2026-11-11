import MaterialIcon from '../landing/MaterialIcon';
import FiraStatusBadge from './FiraStatusBadge';

export type FiraDocument = {
  id: string;
  ref: string;
  bank: string;
  swiftRef: string;
  remittanceValue: string;
  currency: string;
  remitter: string;
  purposeCode: string;
  linkedInvoice?: string;
  invoiceAmount?: string;
  status: 'fully-linked' | 'tolerated-discrepancy' | 'pending-purpose' | 'unlinked';
  discrepancy?: string;
  aiSuggestion?: string;
  timestamp: string;
  hash: string;
  bankStamp: string;
};

export type FiraDocumentTableProps = {
  documents: FiraDocument[];
};

function FiraDocumentTable({ documents }: FiraDocumentTableProps) {
  return (
    <div className="flex flex-col gap-space-sm">
      {documents.map((doc) => (
        <FiraDocumentCard key={doc.id} document={doc} />
      ))}
    </div>
  );
}

function FiraDocumentCard({ document }: { document: FiraDocument }) {
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'fully-linked':
        return 'Fully Linked';
      case 'tolerated-discrepancy':
        return 'Tolerated Discrepancy';
      case 'pending-purpose':
        return 'Pending Purpose';
      case 'unlinked':
        return 'Unlinked Inflow';
      default:
        return status;
    }
  };

  const getIcon = (status: string) => {
    switch (status) {
      case 'fully-linked':
        return 'verified_user';
      case 'tolerated-discrepancy':
        return 'account_balance_wallet';
      case 'pending-purpose':
        return 'currency_exchange';
      case 'unlinked':
        return 'link_off';
      default:
        return 'description';
    }
  };

  const getIconBg = (status: string) => {
    switch (status) {
      case 'fully-linked':
        return 'bg-surface-container';
      case 'tolerated-discrepancy':
        return 'bg-surface-container-high';
      case 'pending-purpose':
        return 'bg-surface-container-high';
      case 'unlinked':
        return 'bg-error-container';
      default:
        return 'bg-surface-container';
    }
  };

  const getIconText = (status: string) => {
    switch (status) {
      case 'fully-linked':
        return 'text-primary';
      case 'tolerated-discrepancy':
        return 'text-secondary';
      case 'pending-purpose':
        return 'text-primary';
      case 'unlinked':
        return 'text-error';
      default:
        return 'text-on-surface';
    }
  };

  return (
    <div className="flex flex-col p-space-md rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all gap-space-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-space-xs">
          <div
            className={`w-9 h-9 rounded-lg ${getIconBg(document.status)} flex items-center justify-center ${getIconText(document.status)} shrink-0`}
          >
            <MaterialIcon name={getIcon(document.status)} className="text-[20px]" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-space-xs">
              <span className="font-headline-sm text-headline-sm font-bold text-on-surface truncate">
                {document.ref}
              </span>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
              {document.bank} • Swift Ref: {document.swiftRef}
            </span>
          </div>
        </div>
        <FiraStatusBadge status={document.status} label={getStatusLabel(document.status)} />
      </div>

      <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-space-xs">
        <div className="flex justify-between items-center">
          <span className="font-label-sm text-label-sm text-on-surface-variant">Remittance Value</span>
          <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
            {document.remittanceValue} {document.currency}
          </span>
        </div>
        <div className="flex justify-between items-center text-on-surface-variant font-body-sm text-body-sm">
          <span>Remitter</span>
          <span className="font-medium text-on-surface">{document.remitter}</span>
        </div>
        <div className="flex justify-between items-center text-on-surface-variant font-body-sm text-body-sm">
          <span>Purpose Code</span>
          <span className="font-code-sm text-code-sm font-semibold text-primary px-space-xs py-0.5 rounded bg-surface-container-high">
            {document.purposeCode}
          </span>
        </div>
      </div>

      {document.linkedInvoice && (
        <div className="flex items-center justify-between text-on-surface-variant font-code-sm text-code-sm">
          <div className="flex items-center gap-space-2xs">
            <MaterialIcon name="link" className="text-[15px] text-tertiary" />
            <span>
              Matched to <strong className="text-on-surface">{document.linkedInvoice}</strong>
            </span>
          </div>
          <span className="text-tertiary font-semibold">100% Match</span>
        </div>
      )}

      {document.discrepancy && (
        <div className="flex justify-between items-center p-space-xs rounded bg-surface-container text-on-surface font-body-sm text-body-sm">
          <span className="flex items-center gap-1 text-on-surface-variant">
            <MaterialIcon name="info" className="text-[15px] text-secondary" />
            {document.discrepancy}
          </span>
          <span className="font-code-sm text-code-sm font-semibold text-secondary">
            {document.invoiceAmount}
          </span>
        </div>
      )}

      {document.aiSuggestion && (
        <div className="flex items-center justify-between p-space-xs rounded bg-surface-container text-on-surface font-body-sm text-body-sm">
          <span className="text-on-surface-variant">
            AI Suggestion: <strong>{document.aiSuggestion}</strong>
          </span>
          <button className="px-space-sm py-0.5 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold shadow-sm hover:opacity-90">
            Confirm Code
          </button>
        </div>
      )}

      <div className="flex items-center justify-between pt-space-xs">
        <button className="flex items-center gap-space-2xs text-primary font-label-md text-label-md font-semibold hover:opacity-80 transition-opacity">
          <MaterialIcon name="visibility" className="text-[18px]" />
          <span>Inspect Certificate</span>
        </button>
        <span className="font-code-sm text-code-sm text-on-surface-variant">{document.timestamp}</span>
      </div>
    </div>
  );
}

export default FiraDocumentTable;
