import type {
  ExceptionKpi,
  FilterPill,
  ExceptionItem,
  ResolvedException,
  ExceptionSection,
} from '../types/exceptions';

export const kpiMetrics: ExceptionKpi[] = [
  {
    label: 'Open Exceptions',
    value: 8,
    subtitle: 'total backlog',
    icon: 'rule_folder',
    variant: 'low',
  },
  {
    label: 'Critical',
    value: 2,
    subtitle: '3d EDPMS',
    icon: 'warning',
    variant: 'critical',
  },
  {
    label: 'High',
    value: 3,
    subtitle: 'discrepant',
    icon: 'priority_high',
    variant: 'high',
  },
  {
    label: 'Medium',
    value: 3,
    subtitle: 'inquiry',
    icon: 'help',
    variant: 'medium',
  },
  {
    label: 'Resolved Today',
    value: 14,
    subtitle: '+100% SLA',
    icon: 'verified',
    variant: 'low',
  },
];

export const filterPills: FilterPill[] = [
  { label: 'All', count: 8, category: 'all', active: true },
  { label: 'Critical', count: 2, category: 'critical', active: false },
  { label: 'Purpose Conflict', count: 0, category: 'purpose', active: false },
  { label: 'FX / Bank Variance', count: 0, category: 'variance', active: false },
  { label: 'Missing FIRA', count: 0, category: 'missing-fira', active: false },
  { label: 'Unmatched Wire', count: 0, category: 'unmatched', active: false },
];

export const sections: ExceptionSection[] = [
  {
    id: 'critical',
    title: 'Critical Regulatory Discrepancies',
    severity: 'critical',
    count: 2,
    subtitle: 'EDPMS Strike Risk',
  },
  {
    id: 'high',
    title: 'High Priority Regulatory & FX Classifications',
    severity: 'high',
    count: 2,
    subtitle: 'Pre-filing Validation',
  },
  {
    id: 'medium',
    title: 'Medium Priority Customs Alignment',
    severity: 'medium',
    count: 1,
    subtitle: 'Port Clearance',
  },
];

export const exceptions: ExceptionItem[] = [
  {
    id: 'exc-8910',
    code: 'EXC-8910',
    invoiceRef: 'INV-2024-918',
    title: 'Apex Robotics Inc.',
    client: 'Apex Robotics Inc.',
    country: 'United States',
    currency: 'USD',
    amount: '$49,965.00',
    severity: 'critical',
    categories: ['critical', 'missing-fira', 'unmatched'],
    timestamp: '18m ago',
    deadline: '3d remaining',
    description: 'Remittance credited at Citi Nostro (Ref: CITINOS-9941) without corresponding bank realization certificate lodged on EDPMS.',
    problemDetails: {
      icon: 'warning',
      title: 'Remittance unlinked to e-FIRA / Bank Advice',
      description: 'Remittance credited at Citi Nostro (Ref: CITINOS-9941) without corresponding bank realization certificate lodged on EDPMS.',
    },
    aiRecommendation: {
      engine: 'B8 Engine',
      confidence: '98.2%',
      suggestion: 'Trigger Instant AD-Cat 1 Bank Ingestion or fetch MT103 Nostro certificate via JPMorgan/Citi API to eliminate human filing latency.',
    },
    bankInfo: 'Citi Nostro (Ref: CITINOS-9941)',
    actions: {
      primary: {
        label: 'Fetch Bank FIRA (Auto)',
        icon: 'cloud_download',
        onClick: "resolveAction('card-exc-8910', 'Bank e-FIRA fetched & EDPMS linked')",
      },
      secondary: {
        label: 'Manual Link',
        onClick: "showManualLinkModal('EXC-8910')",
      },
    },
  },
  {
    id: 'exc-8904',
    code: 'EXC-8904',
    invoiceRef: 'INV-2024-885',
    title: 'Kyoto Digital KK',
    client: 'Kyoto Digital KK',
    country: 'Japan',
    currency: 'JPY',
    amount: '¥4,800,000 JPY',
    amountUsd: '≈ $32,400.00 USD',
    severity: 'critical',
    categories: ['critical', 'unmatched'],
    timestamp: '1h ago',
    description: 'Two inbound credits claim Shipping Bill #SB-9921: SMBC (#UTR-99120) and MUFG (#UTR-99118).',
    problemDetails: {
      icon: 'call_split',
      title: 'Dual Nostro Wires Detected',
      description: 'Two inbound credits claim Shipping Bill #SB-9921: SMBC (#UTR-99120) and MUFG (#UTR-99118).',
    },
    aiRecommendation: {
      engine: 'AI Audit Telemetry',
      confidence: '98.2%',
      suggestion: 'Wire #UTR-99120 is the genuine commercial realization; wire #UTR-99118 represents an unreversed sandbox/test batch remittance from MUFG gateway.',
    },
    shippingBill: 'Shipping Bill #SB-9921 Locked',
    actions: {
      primary: {
        label: 'Enforce Match (#UTR-99120)',
        icon: 'done_all',
        onClick: "resolveAction('card-exc-8904', 'Enforced wire #UTR-99120 match')",
      },
      secondary: {
        label: 'Audit Both',
        onClick: "toggleAudit('card-exc-8904')",
      },
    },
  },
  {
    id: 'exc-8898',
    code: 'EXC-8898',
    invoiceRef: 'INV-2024-912',
    title: 'Valence Cloud GmbH',
    client: 'Valence Cloud GmbH',
    country: 'Germany',
    currency: 'EUR',
    amount: '€38,400.00 EUR',
    severity: 'high',
    categories: ['purpose'],
    timestamp: '3h ago',
    description: 'Purpose Code Conflict: Bank inflow tagged P0803 (Data Hosting) vs contract terms P0802 (Software Consultancy)',
    problemDetails: {
      icon: 'warning',
      title: 'RBI Purpose Code Conflict',
      description: 'Declared Code vs AD Bank Inflow mismatch flagged',
    },
    complianceInfo: {
      icon: 'auto_fix_high',
      title: 'DGFT Handbook Para 2.05 Analysis',
      description: 'Master Service Agreement clause 4.2 confirms custom software architecture IP transfer. Auto-reclassification to P0802 protects against FEMA penalty audits.',
    },
    bankInfo: 'Bank: Deutsche Bank AG',
    actions: {
      primary: {
        label: 'Reclassify to P0802 (AI Validated)',
        icon: 'spellcheck',
        onClick: "resolveAction('card-exc-8898', 'Reclassified to P0802 & filed')",
      },
      secondary: {
        label: 'Flag to CA',
        onClick: "flagToCA('card-exc-8898')",
      },
    },
  },
  {
    id: 'exc-8892',
    code: 'EXC-8892',
    invoiceRef: 'INV-2024-889',
    title: 'Omniverse Ltd',
    client: 'Omniverse Ltd',
    country: 'United Kingdom',
    currency: 'GBP / USD Wire',
    amount: '-$35.00 USD',
    severity: 'high',
    categories: ['variance'],
    timestamp: '5h ago',
    description: 'Intermediary Clearing Swift Haircut: $50,000 billed vs $49,965 received',
    problemDetails: {
      icon: 'currency_exchange',
      title: 'Intermediary Clearing Swift Haircut',
      description: 'Standard correspondent banking deduction by Barclays routing agent prior to recipient Nostro credit.',
    },
    complianceInfo: {
      icon: 'balance',
      title: 'FEMA Section 6 Safe Harbor',
      description: 'Deduction represents 0.07% of principal, safely under the statutory 2.00% write-off threshold allowed without CA approval.',
    },
    actions: {
      primary: {
        label: 'Auto-Absorb Fee (-$35)',
        icon: 'receipt',
        onClick: "resolveAction('card-exc-8892', 'Absorbed $35 bank charge safely under FEMA statutory limit')",
      },
      secondary: {
        label: 'Issue Debit Note',
        onClick: "issueDebitNote('card-exc-8892')",
      },
    },
  },
  {
    id: 'exc-8884',
    code: 'EXC-8884',
    invoiceRef: 'INV-2024-870',
    title: 'Seoul BioTech Corp',
    client: 'Seoul BioTech Corp',
    country: 'South Korea',
    currency: 'USD',
    amount: '$14,200.00 USD',
    severity: 'medium',
    categories: ['medium'],
    timestamp: '8h ago',
    description: 'Missing ICEGATE Endorsement Number: Goods departed Nhava Sheva (INNSA1). Customs shipping bill confirmation payload pending ICEGATE gateway poll.',
    problemDetails: {
      icon: 'local_shipping',
      title: 'Missing ICEGATE Endorsement Number',
      description: 'Goods departed Nhava Sheva (INNSA1). Customs shipping bill confirmation payload pending ICEGATE gateway poll.',
    },
    bankInfo: 'CHA Agent: DHL Global Forwarding',
    actions: {
      primary: {
        label: 'Query ICEGATE API',
        icon: 'sync_alt',
        onClick: "queryIcegate('card-exc-8884')",
      },
      secondary: {
        label: 'Remind Broker',
        onClick: "remindBroker('card-exc-8884')",
      },
    },
  },
];

export const resolvedExceptions: ResolvedException[] = [
  {
    id: 'inv-2024-862',
    invoiceRef: 'INV-2024-862',
    amount: '$62,000.00 USD',
    description: 'Auto-matched to HSBC FIRA-2024-0038',
    resolutionType: 'auto',
    timestamp: '2h ago',
  },
  {
    id: 'inv-2024-859',
    invoiceRef: 'INV-2024-859',
    amount: '€19,500.00 EUR',
    description: 'P0801 Purpose Code confirmed by Compliance Officer',
    resolutionType: 'manual',
    timestamp: '4h ago',
  },
];
