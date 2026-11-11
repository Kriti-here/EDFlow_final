import React from 'react';
import type { MetricCardData } from '../../types/aiinsights';

interface MetricCardProps {
  data: MetricCardData;
  size?: 'large' | 'medium' | 'small';
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  data,
  size = 'medium',
  className = '',
}) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'large':
        return {
          padding: 'p-space-lg',
          value: 'font-headline-lg text-headline-lg',
          subtitle: 'font-body-md text-body-md',
          icon: 'text-[20px]',
          container: 'rounded-2xl',
        };
      case 'medium':
        return {
          padding: 'p-space-md',
          value: 'font-headline-md text-headline-md',
          subtitle: 'font-code-sm text-code-sm',
          icon: 'text-[16px]',
          container: 'rounded-xl',
        };
      case 'small':
        return {
          padding: 'p-space-sm',
          value: 'font-body-lg text-body-lg',
          subtitle: 'font-code-sm text-code-sm',
          icon: 'text-[14px]',
          container: 'rounded-lg',
        };
      default:
        return {
          padding: 'p-space-md',
          value: 'font-headline-md text-headline-md',
          subtitle: 'font-code-sm text-code-sm',
          icon: 'text-[16px]',
          container: 'rounded-xl',
        };
    }
  };

  const sizeClasses = getSizeClasses();

  return (
    <div
      className={`bg-surface-container-lowest shadow-sm flex flex-col gap-1 ${sizeClasses.container} ${sizeClasses.padding} ${className} transition-all duration-300 hover:shadow-md hover:-translate-y-1`}
    >
      <div className="flex items-center justify-between text-on-surface-variant">
        <span className="font-label-sm text-label-sm uppercase font-semibold">
          {data.label}
        </span>
        <span className={`material-symbols-outlined ${sizeClasses.icon} ${data.iconColor || 'text-primary'}`}>
          {data.icon}
        </span>
      </div>
      <span className={`${sizeClasses.value} text-on-surface font-bold`}>
        {data.value}
      </span>
      <span className={`${sizeClasses.subtitle} text-on-surface-variant`}>
        {data.subtitle}
      </span>
    </div>
  );
};

export default MetricCard;
