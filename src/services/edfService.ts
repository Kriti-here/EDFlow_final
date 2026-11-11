// Service to fetch EDF packs from backend API
import type { EDFPack, PackMetric, ActiveCompilation } from '../types/edf';

export interface EDFPacksResponse {
  metrics: PackMetric[];
  activeCompilation: ActiveCompilation | null;
  packs: EDFPack[];
}

export async function fetchEDFPacks(): Promise<EDFPacksResponse> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  const response = await fetch(`${base}/api/edf/packs`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch EDF packs: ${response.status} ${text}`);
  }
  return response.json() as Promise<EDFPacksResponse>;
}
