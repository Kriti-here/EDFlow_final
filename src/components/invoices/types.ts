export type InvoiceStatus = "matched" | "pending" | "exception";
export type InvoiceFilter = "all" | InvoiceStatus | "draft";

type InvoiceDetail =
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
