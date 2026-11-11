// Service to fetch exceptions from backend API
import type { ExceptionItem, ResolvedException, ExceptionKpi } from '../types/exceptions';

export interface ExceptionsResponse {
  kpis: ExceptionKpi[];
  exceptions: ExceptionItem[];
  resolvedToday: ResolvedException[];
  totalResolved: number;
}

export async function fetchExceptions(): Promise<ExceptionsResponse> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  const response = await fetch(`${base}/api/exceptions`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch exceptions: ${response.status} ${text}`);
  }
  return response.json() as Promise<ExceptionsResponse>;
}
