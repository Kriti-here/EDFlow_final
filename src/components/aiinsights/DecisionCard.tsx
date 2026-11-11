import React from 'react';
import type { DecisionRecord } from '../../types/aiinsights';

interface DecisionCardProps {
  decision: DecisionRecord;
  className?: string;
}

export const DecisionCard: React.FC<DecisionCardProps> = ({ decision, className = '' }) => {
  // Determine status color
  const getStatusColor = () => {
    switch (decision.status) {
      case 'accepted':
        return 'bg-[#ECFDF5] text-[#065F46]';
      case 'overridden':
        return 'bg-[#FFFBEB] text-[#92400E]';
      case 'escalated':
        return 'bg-error-container text-on-error-container';
      default:
        return 'bg-surface-container text-on-surface';
    }
  };

  return (
    <div
      className={`p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs ${className}`}
      data-status={decision.status}
    >
      <div className="flex items-center justify-between">
        <span className="font-body-md text-body-md font-semibold text-on-surface">
          {decision.company} ({decision.amount} {decision.currency})
        </span>
        <span
          className={`px-space-xs py-0.5 rounded-full ${getStatusColor()} font-label-sm text-label-sm font-semibold`}
        >
          {decision.status.toUpperCase()}
        </span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        {decision.description}
        {decision.proposedCode && decision.actualCode && (
          <>
            AI proposed <span className="font-semibold text-on-surface">{decision.proposedCode}</span>;
            Auditor switched to <span className="font-semibold text-primary">{decision.actualCode}</span>.
          </>
        )}
      </p>
      {decision.details && (
        <div className="p-space-xs rounded bg-surface-container text-on-surface font-body-sm text-body-sm">
          “{decision.details}”
        </div>
      )}
      <div className="flex items-center justify-between pt-1 font-code-sm text-code-sm text-on-surface-variant">
        {decision.modelConfidence && <span>Model Conf: {decision.modelConfidence}</span>}
        {decision.timestamp && <span>{decision.timestamp}</span>}
        {decision.hash && <span>Hash: {decision.hash}</span>}
        {decision.auditor && <span>Auditor: {decision.auditor}</span>}
        {decision.caseNumber && <span>Case #{decision.caseNumber}</span>}
        {decision.status === 'escalated' && (
          <span className="text-error font-semibold">Pending DGFT Review</span>
        )}
        {decision.status === 'overridden' && (
          <span className="text-secondary font-semibold">Weights re-calibrated</span>
        )}
      </div>
    </div>
  );
};

export default DecisionCard;
