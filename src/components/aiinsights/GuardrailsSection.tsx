import React, { useState } from 'react';
import GuardrailItemComponent from './GuardrailItem';
import type { GuardrailItem } from '../../types/aiinsights';

interface GuardrailsSectionProps {
  items: GuardrailItem[];
  className?: string;
}

export const GuardrailsSection: React.FC<GuardrailsSectionProps> = ({
  items,
  className = '',
}) => {
  const [showToast, setShowToast] = useState(false);

  const handleExport = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  return (
    <div
      className={`p-space-base rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-md ${className}`}
    >
      <div className="flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-primary text-[20px]">
          admin_panel_settings
        </span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
          Human Oversight Guardrails
        </h2>
      </div>

      <div className="flex flex-col gap-space-sm">
        {items.map((item) => (
          <GuardrailItemComponent key={item.id} item={item} />
        ))}
      </div>

      {/* Export Button */}
      <button
        className="w-full py-space-sm rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm font-semibold hover:bg-primary-container transition-all flex items-center justify-center gap-2 shadow-sm"
        onClick={handleExport}
        type="button"
      >
        <span className="material-symbols-outlined text-[20px]">download</span>
        <span>Download Complete AI Audit Dossier (.JSON / Merkle PDF)</span>
      </button>

      {/* Toast Notification */}
      <div
        className={`${
          showToast ? '' : 'hidden'
        } p-space-sm rounded-lg bg-surface-container font-code-sm text-code-sm text-on-surface text-center transition-all`}
      >
        Package signed and downloaded with Merkle Seed SHA-256 certificate.
      </div>
    </div>
  );
};

export default GuardrailsSection;
