import React from 'react';
import type { ForensicAudit } from '../../types/aiinsights';

interface ForensicAuditCardProps {
  data: ForensicAudit;
  className?: string;
}

export const ForensicAuditCard: React.FC<ForensicAuditCardProps> = ({ data, className = '' }) => {
  return (
    <div
      className={`p-space-base rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-md ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[20px]">psychology</span>
          </div>
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              Live Inference Audit
            </h2>
            <p className="font-code-sm text-code-sm text-on-surface-variant">
              {data.invoiceNumber} • {data.company}
            </p>
          </div>
        </div>
        <span className="px-space-sm py-1 rounded-full bg-[#ECFDF5] text-[#065F46] font-label-sm text-label-sm font-semibold">
          CONFIDENCE {data.confidence}
        </span>
      </div>

      {/* Recommendation Contrast Row */}
      <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
          <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface-variant">
            AI Proposed Code
          </span>
          <span className="font-label-sm text-label-sm text-error font-semibold line-through">
            Bank Tag: {data.bankTag}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-primary text-on-primary font-code-sm text-code-sm font-bold">
              {data.aiProposedCode}
            </span>
            <span className="font-body-md text-body-md text-on-surface font-semibold">
              {data.codeDescription}
            </span>
          </div>
          <span className="font-code-sm text-code-sm text-on-surface-variant">
            {data.amount}
          </span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {data.rationale}
        </p>
      </div>

      {/* Chain of Custody & Evidence Steps */}
      <div className="flex flex-col gap-space-sm">
        <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant tracking-wider">
          Forensic Rationale & Proof Chain
        </span>
        <div className="flex gap-space-sm items-start">
          <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">
            article
          </span>
          <div className="flex-1">
            <p className="font-body-sm text-body-sm text-on-surface font-semibold">
              Clause 4.2 Contract Extract
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              “Custom API development, CI/CD automated pipeline orchestration.” Model
              semantic weights: 92% consultancy, 8% server telemetry.
            </p>
          </div>
        </div>
        <div className="flex gap-space-sm items-start">
          <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">
            gavel
          </span>
          <div className="flex-1">
            <p className="font-body-sm text-body-sm text-on-surface font-semibold">
              Statutory Authority Alignment
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {data.authorityAlignment}
            </p>
          </div>
        </div>
        <div className="flex gap-space-sm items-start">
          <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">
            rule
          </span>
          <div className="flex-1">
            <p className="font-body-sm text-body-sm text-on-surface font-semibold">
              Multi-Vector Confidence Factor
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              {data.confidenceFactors.map((factor, index) => (
                <span
                  key={index}
                  className="px-2 py-0.5 rounded-md bg-surface-container font-code-sm text-code-sm text-on-surface"
                >
                  {factor.label}: {factor.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Human Decision Lock Action Bar */}
      <div className="pt-space-xs flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-on-surface-variant font-code-sm text-code-sm">
          <span className="material-symbols-outlined text-[16px] text-tertiary">
            fingerprint
          </span>
          <span>SHA: {data.shaHash}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-space-sm py-1.5 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container font-label-md text-label-md transition-colors"
            type="button"
          >
            Modify Code
          </button>
          <button
            className="px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary-container transition-all flex items-center gap-1"
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">check</span>
            Affirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForensicAuditCard;
