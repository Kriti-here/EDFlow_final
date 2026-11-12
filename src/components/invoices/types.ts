/** UI bucket for a backend invoice status (DRAFT / SENT / PAID). */
export type InvoiceStatus = "matched" | "pending" | "draft" | "exception";
export type InvoiceFilter = "all" | InvoiceStatus;

type InvoiceDetail =
  | {
      kind: "record";
      serviceDescription: string;
      purposeCode: string | null;
      purposeVerified: boolean | null;
      contractRef: string | null;
      issued: string;
      due: string;
      edfDue: string | null;
      edfDaysRemaining: number | null;
      paypalInvoiceUrl: string | null;
    }
  | {
      kind: "matched";
      shippingBill: string;
      purpose: string;
      mt103: number;
    }
  | {
      kind: "variance";
      title: string;
      description: string;
      actionNote: string;
    }
  | {
      kind: "purpose";
      suggestedCode: string;
      previousCode: string;
      matchPercent: number;
    }
  | {
      kind: "pending";
      eta: string;
      bank: string;
      purpose: string;
    }
  | {
      kind: "filed";
      reference: string;
    };

export type InvoiceRecord = {
  id: string;
  buyer: string;
  country: string;
  amount: string;
  currency: string;
  status: InvoiceStatus;
  badge: string;
  badgeTone: "success" | "warning" | "info" | "neutral" | "filed";
  searchText: string;
  detail: InvoiceDetail;
  action: string;
  actionIcon?: string;
  actionTone: "primary" | "secondary" | "link";
};

export type InvoiceFilterOption = {
  value: InvoiceFilter;
  label: string;
  count: number;
};
