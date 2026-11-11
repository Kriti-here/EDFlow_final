import React from 'react';

interface AIInsightsHeaderProps {
  className?: string;
}

export const AIInsightsHeader: React.FC<AIInsightsHeaderProps> = ({ className = '' }) => {
  return (
    <div className={`flex flex-col gap-space-xs ${className}`}>
      {/* Top Badge */}
      <div className="inline-flex items-center gap-1.5 px-space-sm py-space-xs rounded-full bg-surface-container self-start">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
        <span className="font-label-sm text-label-sm text-primary tracking-wider uppercase font-semibold">
          Regulatory Co-Pilot Telemetry • FEDAI & RBI Auditable
        </span>
      </div>

      {/* Main Header */}
      <div className="flex flex-col">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface tracking-tight font-bold">
          AI Insights & Telemetry
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
          Real-time explainability audit, model decision telemetry, and human-in-the-loop governance logs.
        </p>
      </div>
    </div>
  );
};

export default AIInsightsHeader;
