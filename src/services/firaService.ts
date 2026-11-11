// Service to fetch FIRA documents from backend API
// Backend: GET /fira/documents → {count: number, documents: object[]}

import { apiUrl } from './api';

export interface ListFiraResponse {
  count: number;
  documents: any[]; // raw documents from backend
}

export async function fetchFiraDocuments(): Promise<any[]> {
  const response = await fetch(apiUrl('/fira/documents'));
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch FIRA documents: ${response.status} ${errorText}`);
  }
  const data: ListFiraResponse = await response.json();
  return data.documents;
}
