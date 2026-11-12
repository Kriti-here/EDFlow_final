import MaterialIcon from '../landing/MaterialIcon';

/** One bank that appears in the uploaded FIRA statements. */
export type BankNode = {
  name: string;
  /** How many stored statements were issued by this bank. */
  statementCount: number;
};

export type FiraValidationCardProps = {
  title: string;
  status: string;
  banks: BankNode[];
};

/**
 * Lists the banks actually seen in the stored FIRA statements, with how many
 * statements each one contributed. It never claims a live bank feed.
 */
function FiraValidationCard({ title, status, banks }: FiraValidationCardProps) {
  return (
    <div className="flex flex-col p-space-md rounded-xl bg-surface-container-lowest shadow-sm gap-space-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <MaterialIcon name="account_balance" className="text-[18px] text-primary" />
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
        </div>
        <div className="flex items-center gap-1.5 px-space-sm py-space-2xs rounded-full bg-surface-container text-primary font-label-sm text-label-sm font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
          <span>{status}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-space-xs text-center sm:grid-cols-3">
        {banks.map((bank) => (
          <div
            key={bank.name}
            className="flex flex-col items-center p-space-xs rounded-lg bg-surface-container-low"
          >
            <span className="font-label-md text-label-md font-semibold text-on-surface truncate w-full">
              {bank.name}
            </span>
            <span className="font-code-sm text-code-sm text-on-surface-variant flex items-center gap-0.5 mt-space-2xs">
              <MaterialIcon name="description" className="text-[12px]" />
              {bank.statementCount} {bank.statementCount === 1 ? 'statement' : 'statements'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FiraValidationCard;
