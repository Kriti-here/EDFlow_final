import React from 'react';

interface StatusBadgeProps {
  status: string;
  color?: string;
  icon?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  color = 'bg-[#ECFDF5] text-[#065F46]',
  icon,
  className = '',
}) => {
  return (
    <span
      className={`px-space-xs py-0.5 rounded-full ${color} font-label-sm text-label-sm font-semibold flex items-center gap-1 ${className}`}
    >
      {icon && <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>}
      {status}
    </span>
  );
};

export default StatusBadge;
