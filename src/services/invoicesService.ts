// Invoice and payment-ledger service. All calls go through the shared client
// in api.ts, so the base URL and error handling stay centralised.
//
// Backend routes used here (all already existed):
//   GET  /invoices                  list invoices, newest first
//   POST /invoices                  create an invoice (database only, no PayPal call)
//   POST /invoices/{id}/send        create + send a PayPal invoice (sandbox)
//   POST /invoices/{id}/pay-link    Orders v2 approval link (fee/net known on capture)
//   GET  /ledger                    recorded PayPal payments and fees

import { fetchJson, postJson } from './api';

/** One invoice exactly as `/invoices` returns it. */
export interface BackendInvoice {
  id: number;
  number: string;
  client: string;
  client_email: string;
  client_country: string | null;
  currency: string;
  amount: string;
  issue_date: string;
  due_date: string;
  service_description: string;
  contract_ref: string | null;
  purpose_code: string | null;
  status: string;
  paypal_invoice_id: string | null;
  paypal_invoice_url: string | null;
  paypal_order_id: string | null;
  edf_due_date: string | null;
  edf_days_remaining: number | null;
  purpose_code_verified: boolean | null;
}

/** Body accepted by `POST /invoices`. */
export interface InvoiceInput {
  client_name: string;
  client_email: string;
  client_country?: string | null;
  currency: string;
  amount: string;
  service_description?: string;
  contract_ref?: string | null;
  purpose_code?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
}

/** One recorded payment exactly as `/ledger` returns it. Money is decimal text. */
export interface LedgerEntry {
  id: number;
  invoice: string | null;
  client: string | null;
  paid_at: string | null;
  currency: string | null;
  receivable_currency: string | null;
  gross: string | null;
  paypal_fee: string | null;
  net: string | null;
  receivable_amount: string | null;
  fx_rate: string | null;
  fx_rate_source: string | null;
  data_source: string | null;
  capture_id: string | null;
}

/** Response of `POST /invoices/{id}/pay-link`. */
export interface PayLinkResponse {
  order_id: string;
  approve_url: string | null;
}

export function fetchInvoices(): Promise<BackendInvoice[]> {
  return fetchJson<BackendInvoice[]>('/invoices');
}

export function createInvoice(body: InvoiceInput): Promise<BackendInvoice> {
  return postJson<BackendInvoice>('/invoices', body);
}

export function sendInvoice(id: number): Promise<BackendInvoice> {
  return postJson<BackendInvoice>(`/invoices/${id}/send`);
}

export function createPayLink(id: number): Promise<PayLinkResponse> {
  return postJson<PayLinkResponse>(`/invoices/${id}/pay-link`);
}

export function fetchLedger(): Promise<LedgerEntry[]> {
  return fetchJson<LedgerEntry[]>('/ledger');
}
