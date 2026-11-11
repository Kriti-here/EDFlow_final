import React from 'react';
import type { GuardrailItem } from '../../types/aiinsights';

interface GuardrailItemProps {
  item: GuardrailItem;
  className?: string;
}

export const GuardrailItemComponent: React.FC<GuardrailItemProps> = ({
  item,
  className = '',
}) => {
  return (
    <div className={`flex items-center justify-between py-1 ${className}`}>
      <div>
        <p className="font-body-md text-body-md font-semibold text-on-surface">
          {item.title}
        </p>
        <p className="font-code-sm text-code-sm text-on-surface-variant">
          {item.description}
        </p>
      </div>
      <span
        className={`px-2 py-1 rounded ${item.statusColor} font-code-sm text-code-sm font-bold`}
      >
        {item.status}
      </span>
    </div>
  );
};

export default GuardrailItemComponent;
