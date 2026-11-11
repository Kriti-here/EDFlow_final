// Service to fetch FIRA documents from backend API
// Backend: GET /fira/documents → {count: number, documents: object[]}

export interface ListFiraResponse {
  count: number;
  documents: any[]; // raw documents from backend
}

export async function fetchFiraDocuments(): Promise<any[]> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  const response = await fetch(`${base}/fira/documents`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch FIRA documents: ${response.status} ${errorText}`);
  }
  const data: ListFiraResponse = await response.json();
  return data.documents;
}
