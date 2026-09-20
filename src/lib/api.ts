import type { CustomSource, MapItem, Pin } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  aircraft: (bbox?: string) => json<MapItem[]>(`/api/aircraft${bbox ? `?bbox=${encodeURIComponent(bbox)}` : ''}`),
  vessels: () => json<MapItem[]>('/api/vessels'),
  satellites: () => json<MapItem[]>('/api/satellites'),
  earthquakes: () => json<MapItem[]>('/api/earthquakes'),
  traffic: () => json<MapItem[]>('/api/traffic'),
  cameras: () => json<MapItem[]>('/api/cameras'),
  geocode: (q: string) => json<{ lat: number; lng: number; displayName: string }[]>(`/api/geocode?q=${encodeURIComponent(q)}`),
  communityColleges: (q: string) => json<MapItem[]>(`/api/places/community-colleges?q=${encodeURIComponent(q)}`),
  pins: () => json<Pin[]>('/api/pins'),
  createPin: (pin: Omit<Pin, 'id' | 'createdAt'>) => json<Pin>('/api/pins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pin) }),
  deletePin: (id: string) => json<{ ok: true }>(`/api/pins/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  sources: () => json<CustomSource[]>('/api/sources'),
  createSource: (source: Omit<CustomSource, 'id' | 'createdAt'>) => json<CustomSource>('/api/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(source) }),
  deleteSource: (id: string) => json<{ ok: true }>(`/api/sources/${encodeURIComponent(id)}`, { method: 'DELETE' })
};
