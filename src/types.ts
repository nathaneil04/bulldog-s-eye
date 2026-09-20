export type LayerId = 'aircraft' | 'vessels' | 'satellites' | 'earthquakes' | 'traffic' | 'cameras';

export interface MapItem {
  id: string;
  kind: LayerId | 'pin' | 'source' | 'college';
  name: string;
  lat: number;
  lng: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  detail?: Record<string, unknown>;
  imageUrl?: string;
  source?: string;
}

export interface Pin {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  createdAt: string;
}

export interface CustomSource {
  id: string;
  name: string;
  url: string;
  type: 'geojson' | 'json';
  createdAt: string;
}
