import type { SavedPriceGroup } from '../../../shared/types.ts';

export type GroupInput = Pick<SavedPriceGroup, 'name' | 'cost' | 'pokemonIds'>;

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server');
  }
  const json = await res.json().catch(() => ({ ok: false, error: `Server error (${res.status})` }));
  if (!json.ok) throw new Error(json.error ?? 'Request failed');
  return json.data as T;
}

export const listSavedGroups = () => request<SavedPriceGroup[]>('GET', '/api/price-groups');
export const createSavedGroup = (g: GroupInput) => request<SavedPriceGroup>('POST', '/api/price-groups', g);
export const updateSavedGroup = (id: string, g: GroupInput) => request<SavedPriceGroup>('PUT', `/api/price-groups/${encodeURIComponent(id)}`, g);
export const deleteSavedGroup = (id: string) => request<null>('DELETE', `/api/price-groups/${encodeURIComponent(id)}`);
