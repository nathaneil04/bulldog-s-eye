import express, { type Request, type Response } from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as satellite from 'satellite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'app-data.json');
const PORT = Number(process.env.PORT || 8787);
const DIGITRAFFIC_USER = process.env.DIGITRAFFIC_USER || "GodsEye/1.0 (open-data-map)";

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8')) as { pins: any[]; sources: any[] };
  } catch {
    const fresh = { pins: [], sources: [] };
    await writeStore(fresh);
    return fresh;
  }
}

async function writeStore(data: { pins: any[]; sources: any[] }) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

const cache = new Map<string, { expires: number; data: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  const data = await fn();
  cache.set(key, { expires: Date.now() + ttlMs, data });
  return data;
}

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json', ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: "God's Eye API", time: new Date().toISOString() }));

app.get('/api/aircraft', async (req, res) => {
  try {
    const bbox = String(req.query.bbox || '');
    const url = bbox
      ? `https://opensky-network.org/api/states/all?${bbox.split(',').map((v, i) => `${['lamin','lomin','lamax','lomax'][i]}=${encodeURIComponent(v)}`).join('&')}`
      : 'https://opensky-network.org/api/states/all';
    const data = await cached(`aircraft:${bbox}`, 15000, async () => {
      const headers: Record<string, string> = {};
      if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
        // OpenSky OAuth tokens are intentionally left to the provider adapter; anonymous access still works within current limits.
      }
      return fetchJson(url, headers);
    });
    const states = Array.isArray(data?.states) ? data.states : [];
    const items = states.slice(0, 2500).flatMap((s: any[], idx: number) => {
      const [icao24, callsign, originCountry, timePosition, lastContact, lon, lat, baroAltitude, onGround, velocity, trueTrack, verticalRate, sensors, geoAltitude, squawk] = s;
      if (typeof lat !== 'number' || typeof lon !== 'number') return [];
      return [{
        id: String(icao24 || `ac-${idx}`), kind: 'aircraft', name: String(callsign || icao24 || 'Unknown aircraft').trim(), lat, lng: lon,
        altitude: typeof baroAltitude === 'number' ? baroAltitude : undefined,
        speed: typeof velocity === 'number' ? velocity : undefined,
        heading: typeof trueTrack === 'number' ? trueTrack : undefined,
        source: 'OpenSky Network',
        detail: { originCountry, timePosition, lastContact, onGround, verticalRate, geoAltitude, squawk }
      }];
    });
    res.json(items);
  } catch (e) {
    res.status(502).json({ error: 'Aircraft source unavailable', detail: String(e) });
  }
});

app.get('/api/vessels', async (_req, res) => {
  try {
    const raw = await cached('vessels', 30000, () => fetchJson('https://meri.digitraffic.fi/api/ais/v1/locations', { 'Digitraffic-User': DIGITRAFFIC_USER, 'Accept-Encoding': 'gzip' }));
    const features = Array.isArray(raw?.features) ? raw.features : Array.isArray(raw) ? raw : [];
    const items = features.slice(0, 1800).flatMap((f: any, idx: number) => {
      const c = f?.geometry?.coordinates;
      const p = f?.properties || f;
      if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number') return [];
      const name = p.name || p.shipName || p.mmsi || `Vessel ${idx + 1}`;
      return [{
        id: String(p.mmsi || p.id || `v-${idx}`), kind: 'vessels', name: String(name), lat: c[1], lng: c[0],
        speed: typeof p.sog === 'number' ? p.sog : undefined, heading: typeof p.heading === 'number' ? p.heading : typeof p.cog === 'number' ? p.cog : undefined,
        source: 'Digitraffic AIS', detail: p
      }];
    });
    res.json(items);
  } catch (e) {
    res.status(502).json({ error: 'Vessel source unavailable', detail: String(e) });
  }
});

function parseTle(text: string) {
  const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const out: { name: string; l1: string; l2: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ') && lines[i + 1]?.startsWith('2 ')) out.push({ name: lines[i - 1] || 'Satellite', l1: lines[i], l2: lines[i + 1] });
  }
  return out;
}

app.get('/api/satellites', async (_req, res) => {
  try {
    const text = await cached('satellite-tle', 2 * 60 * 60 * 1000, async () => {
      const r = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=STATIONS&FORMAT=TLE');
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.text();
    });
    const now = new Date();
    const observer = satellite.eciToGeodetic({ x: 0, y: 0, z: 0 } as any, satellite.gstime(now));
    void observer;
    const items = parseTle(text).slice(0, 500).flatMap((t, idx) => {
      try {
        const satrec = satellite.twoline2satrec(t.l1, t.l2);
        const pv = satellite.propagate(satrec, now);
        if (!pv.position || typeof pv.position === 'boolean') return [];
        const gmst = satellite.gstime(now);
        const geo = satellite.eciToGeodetic(pv.position, gmst);
        return [{
          id: `sat-${idx}-${t.name}`,
          kind: 'satellites', name: t.name,
          lat: satellite.degreesLat(geo.latitude), lng: satellite.degreesLong(geo.longitude), altitude: geo.height * 1000,
          source: 'CelesTrak', detail: { line1: t.l1, line2: t.l2 }
        }];
      } catch { return []; }
    });
    res.json(items);
  } catch (e) {
    res.status(502).json({ error: 'Satellite source unavailable', detail: String(e) });
  }
});

app.get('/api/earthquakes', async (_req, res) => {
  try {
    const raw = await cached('earthquakes', 60000, () => fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'));
    const items = (raw?.features || []).slice(0, 500).flatMap((f: any) => {
      const c = f?.geometry?.coordinates;
      if (!Array.isArray(c) || c.length < 2) return [];
      return [{ id: `eq-${f.id}`, kind: 'earthquakes', name: f?.properties?.place || 'Earthquake', lat: c[1], lng: c[0], altitude: -(Number(c[2] || 0) * 1000), source: 'USGS', detail: f.properties }];
    });
    res.json(items);
  } catch (e) {
    res.status(502).json({ error: 'Earthquake source unavailable', detail: String(e) });
  }
});

app.get('/api/traffic', async (_req, res) => {
  try {
    if (process.env.TOMTOM_API_KEY) {
      return res.json({ mode: 'tomtom-keyed', items: [], message: 'TomTom adapter is available. Request a point-based flow query from the client or extend this route for a viewport grid.' });
    }
    const raw = await cached('traffic', 60000, () => fetchJson('https://tie.digitraffic.fi/api/traffic-message/v2/traffic-announcements?includeAreaGeometry=true', { 'Digitraffic-User': DIGITRAFFIC_USER, 'Accept-Encoding': 'gzip' }));
    const features = Array.isArray(raw?.features) ? raw.features : [];
    const items = features.slice(0, 600).flatMap((f: any, idx: number) => {
      const c = f?.geometry?.coordinates;
      if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
        return [{ id: `traffic-${idx}`, kind: 'traffic', name: f?.properties?.title || f?.properties?.situationType || 'Traffic event', lat: c[1], lng: c[0], source: 'Digitraffic Road', detail: f.properties }];
      }
      const loc = f?.properties?.announcements?.[0]?.locationDetails?.pointLocation?.pointByCoordinates;
      if (loc?.latitude && loc?.longitude) return [{ id: `traffic-${idx}`, kind: 'traffic', name: f?.properties?.situationType || 'Traffic event', lat: Number(loc.latitude), lng: Number(loc.longitude), source: 'Digitraffic Road', detail: f.properties }];
      return [];
    });
    res.json(items);
  } catch (e) {
    res.status(502).json({ error: 'Traffic source unavailable', detail: String(e) });
  }
});

app.get('/api/cameras', async (_req, res) => {
  try {
    const raw = await cached('cameras', 10 * 60 * 1000, () => fetchJson('https://tie.digitraffic.fi/api/weathercam/v1/stations/data', { 'Digitraffic-User': DIGITRAFFIC_USER, 'Accept-Encoding': 'gzip' }));
    const stations = Array.isArray(raw?.cameraStations) ? raw.cameraStations : Array.isArray(raw) ? raw : [];
    const items = stations.slice(0, 700).flatMap((s: any, idx: number) => {
      const lat = Number(s?.location?.latitude ?? s?.latitude);
      const lng = Number(s?.location?.longitude ?? s?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const preset = s?.presets?.find?.((p: any) => p?.inCollection !== false) || s?.presets?.[0];
      const imageUrl = preset?.imageUrl || (preset?.id ? `https://weathercam.digitraffic.fi/${preset.id}.jpg` : undefined);
      return [{ id: `cam-${s.id || idx}`, kind: 'cameras', name: s.name || `Road camera ${s.id || idx}`, lat, lng, imageUrl, source: 'Digitraffic Weathercam', detail: { station: s } }];
    });
    res.json(items);
  } catch (e) {
    res.status(502).json({ error: 'Camera source unavailable', detail: String(e) });
  }
});

app.get('/api/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
    const data = await cached(`geo:${q.toLowerCase()}`, 10 * 60 * 1000, () => fetchJson(url, { 'User-Agent': DIGITRAFFIC_USER }));
    res.json((data || []).map((x: any) => ({ lat: Number(x.lat), lng: Number(x.lon), displayName: String(x.display_name) })));
  } catch (e) {
    res.status(502).json({ error: 'Geocoder unavailable', detail: String(e) });
  }
});

app.get('/api/places/community-colleges', async (req, res) => {
  const q = String(req.query.q || 'community colleges').trim() || 'community colleges';
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q,
      limit: '20',
      addressdetails: '1',
      extratags: '1',
      namedetails: '1',
      layer: 'poi',
      include: 'osm.amenity.college',
    });
    const data = await cached(`community-colleges:${q.toLowerCase()}`, 60_000, () => fetchJson(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      'User-Agent': DIGITRAFFIC_USER,
      'Accept': 'application/json',
    }));
    const items = (Array.isArray(data) ? data : []).map((x: any, idx: number) => ({
      id: `college-${x.osm_type || 'x'}-${x.osm_id || idx}`,
      kind: 'college',
      name: String(x.name || x.display_name?.split(',')[0] || 'Community college'),
      lat: Number(x.lat),
      lng: Number(x.lon),
      source: 'OpenStreetMap / Nominatim',
      detail: {
        displayName: String(x.display_name || ''),
        osmType: x.osm_type,
        osmId: x.osm_id,
        category: x.type || x.class,
        address: x.address,
        website: x.extratags?.website || x.extratags?.contact?.website,
      },
    })).filter((x: any) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
    res.json(items);
  } catch (e) {
    res.status(502).json({ error: 'Community college search unavailable', detail: String(e) });
  }
});

app.get('/api/pins', async (_req, res) => res.json((await readStore()).pins));
app.post('/api/pins', async (req, res) => {
  const { name, description, lat, lng } = req.body || {};
  if (!name || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return res.status(400).json({ error: 'name, lat and lng are required' });
  const store = await readStore();
  const pin = { id: randomUUID(), name: String(name), description: description ? String(description) : '', lat: Number(lat), lng: Number(lng), createdAt: new Date().toISOString() };
  store.pins.unshift(pin); await writeStore(store); res.status(201).json(pin);
});
app.delete('/api/pins/:id', async (req, res) => { const store = await readStore(); store.pins = store.pins.filter((p) => p.id !== req.params.id); await writeStore(store); res.json({ ok: true }); });

app.get('/api/sources', async (_req, res) => res.json((await readStore()).sources));
app.post('/api/sources', async (req, res) => {
  const { name, url, type = 'geojson' } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
  const store = await readStore();
  const source = { id: randomUUID(), name: String(name), url: String(url), type: type === 'json' ? 'json' : 'geojson', createdAt: new Date().toISOString() };
  store.sources.unshift(source); await writeStore(store); res.status(201).json(source);
});
app.delete('/api/sources/:id', async (req, res) => { const store = await readStore(); store.sources = store.sources.filter((s) => s.id !== req.params.id); await writeStore(store); res.json({ ok: true }); });

app.get('/api/source-data', async (req, res) => {
  const url = String(req.query.url || '');
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Valid http(s) URL required' });
  try {
    const raw = await cached(`source:${url}`, 120000, () => fetchJson(url));
    res.json(raw);
  } catch (e) { res.status(502).json({ error: 'Custom source unavailable', detail: String(e) }); }
});

const dist = path.join(ROOT, 'dist');
app.use(express.static(dist));
app.get(/.*/, async (_req, res) => {
  try { res.sendFile(path.join(dist, 'index.html')); } catch { res.status(404).send('God\'s Eye API is running. Build the Vite frontend for production.'); }
});

app.listen(PORT, () => console.log(`God's Eye API listening on http://localhost:${PORT}`));
