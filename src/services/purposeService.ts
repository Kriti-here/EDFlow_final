// Service to fetch purpose code queue from backend API
import type { QueueItem, PurposeCase, Metric } from '../types/purpose';

export interface PurposeQueueResponse {
  metrics: Metric[];
  primaryCase: PurposeCase | null;
  queueItems: QueueItem[];
}

export async function fetchPurposeQueue(): Promise<PurposeQueueResponse> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  const response = await fetch(`${base}/api/purpose/queue`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch purpose queue: ${response.status} ${text}`);
  }
  return response.json() as Promise<PurposeQueueResponse>;
}
