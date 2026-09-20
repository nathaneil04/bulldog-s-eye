import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type Map as MapLibreMap, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { MapItem } from '../types';

maplibregl.setWorkerUrl(maplibreWorker);

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface MapHandle {
  focus: (lat: number, lng: number, zoom?: number) => void;
  locate: () => void;
}

interface Props {
  items: MapItem[];
  selected?: MapItem | null;
  onSelect: (item: MapItem) => void;
  onMapClick: (lat: number, lng: number) => void;
  dark: boolean;
  userLocation?: UserLocation | null;
  followUser?: boolean;
}

const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const LAYER_IDS = ['objects-aircraft', 'objects-vessels', 'objects-satellites', 'objects-earthquakes', 'objects-traffic', 'objects-cameras', 'objects-pin', 'objects-source', 'objects-college'];

const kindRadius: Record<string, number> = {
  aircraft: 6,
  vessels: 6,
  satellites: 5,
  earthquakes: 8,
  traffic: 5,
  cameras: 7,
  pin: 8,
  source: 6,
  college: 7,
};

const kindColor: Record<string, string> = {
  aircraft: '#f1f1f1',
  vessels: '#babcc1',
  satellites: '#8e9199',
  earthquakes: '#ffffff',
  traffic: '#73767d',
  cameras: '#d0d2d6',
  pin: '#ffffff',
  source: '#9da0a7',
  college: '#f0f1f3',
};

const MapView = forwardRef<MapHandle, Props>(function MapView({ items, selected, onSelect, onMapClick, dark, userLocation, followUser }, ref) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const itemsRef = useRef<MapItem[]>(items);
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  const darkRef = useRef(dark);
  const userLocationRef = useRef<UserLocation | null>(userLocation ?? null);
  const followUserRef = useRef(Boolean(followUser));

  itemsRef.current = items;
  onSelectRef.current = onSelect;
  onMapClickRef.current = onMapClick;
  darkRef.current = dark;
  userLocationRef.current = userLocation ?? null;
  followUserRef.current = Boolean(followUser);

  useImperativeHandle(ref, () => ({
    focus(lat, lng, zoom = 12) {
      if (!mapRef.current) return;
      const resolvedZoom = zoom < 3 ? 12 : zoom;
      mapRef.current.easeTo({ center: [lng, lat], zoom: Math.min(18, Math.max(2, resolvedZoom)), duration: 900 });
    },
    locate() {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
          userLocationRef.current = next;
          const currentMap = mapRef.current;
          if (currentMap) currentMap.easeTo({ center: [next.lng, next.lat], zoom: Math.max(currentMap.getZoom(), 15), duration: 800 });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      );
    },
  }), []);

  const installLayers = (map: MapLibreMap) => {
    if (map.getSource('objects')) return;

    map.addSource('objects', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addSource('selected-object', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.addSource('user-location', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addSource('user-accuracy', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    (Object.keys(kindColor) as string[]).forEach((kind) => {
      const id = `objects-${kind}`;
      map.addLayer({
        id,
        type: 'circle',
        source: 'objects',
        filter: ['==', ['get', 'kind'], kind],
        paint: {
          'circle-radius': kindRadius[kind] || 6,
          'circle-color': kindColor[kind] || '#d5d7db',
          'circle-opacity': 0.96,
          'circle-stroke-color': '#070707',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.9,
        },
      });
    });

    map.addLayer({
      id: 'objects-selected-ring',
      type: 'circle',
      source: 'selected-object',
      paint: {
        'circle-radius': 13,
        'circle-color': 'rgba(255,255,255,0)',
        'circle-stroke-color': darkRef.current ? '#ffffff' : '#111111',
        'circle-stroke-width': 2,
        'circle-opacity': 0,
      },
    });

    map.addLayer({
      id: 'user-accuracy',
      type: 'fill',
      source: 'user-accuracy',
      paint: {
        'fill-color': '#3b82f6',
        'fill-opacity': 0.10,
      },
    });
    map.addLayer({
      id: 'user-accuracy-outline',
      type: 'line',
      source: 'user-accuracy',
      paint: {
        'line-color': '#60a5fa',
        'line-opacity': 0.24,
        'line-width': 1,
      },
    });
    map.addLayer({
      id: 'user-location-halo',
      type: 'circle',
      source: 'user-location',
      paint: {
        'circle-radius': 12,
        'circle-color': '#3b82f6',
        'circle-opacity': 0.18,
        'circle-stroke-color': '#93c5fd',
        'circle-stroke-width': 1,
        'circle-stroke-opacity': 0.38,
      },
    });
    map.addLayer({
      id: 'user-location-dot',
      type: 'circle',
      source: 'user-location',
      paint: {
        'circle-radius': 6,
        'circle-color': '#2563eb',
        'circle-opacity': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5,
      },
    });

    LAYER_IDS.forEach((id) => {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  };

  const buildAccuracyPolygon = (lat: number, lng: number, accuracy: number) => {
    const radius = Math.max(accuracy, 1);
    const latDelta = radius / 111320;
    const lngDelta = radius / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
    const coordinates = Array.from({ length: 64 }, (_, index) => {
      const angle = (index / 64) * Math.PI * 2;
      return [lng + Math.cos(angle) * lngDelta, lat + Math.sin(angle) * latDelta];
    });
    coordinates.push(coordinates[0]);
    return coordinates;
  };

  const syncUserLocation = (map: MapLibreMap) => {
    const point = userLocationRef.current;
    const locationSource = map.getSource('user-location') as GeoJSONSource | undefined;
    const accuracySource = map.getSource('user-accuracy') as GeoJSONSource | undefined;
    if (!locationSource || !accuracySource) return;
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      locationSource.setData({ type: 'FeatureCollection', features: [] });
      accuracySource.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    locationSource.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [point.lng, point.lat] }, properties: {} }],
    });
    const accuracy = Number(point.accuracy || 0);
    accuracySource.setData({
      type: 'FeatureCollection',
      features: accuracy > 0 ? [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [buildAccuracyPolygon(point.lat, point.lng, accuracy)] },
        properties: { accuracy },
      }] : [],
    });
    if (followUserRef.current) {
      map.easeTo({ center: [point.lng, point.lat], duration: 450 });
    }
  };

  const syncData = (map: MapLibreMap) => {
    const source = map.getSource('objects') as GeoJSONSource | undefined;
    if (!source) return;
    const features = itemsRef.current
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .map((item) => ({
        type: 'Feature' as const,
        id: item.id,
        geometry: { type: 'Point' as const, coordinates: [item.lng, item.lat] },
        properties: { id: item.id, name: item.name, kind: item.kind, source: item.source || '' },
      }));
    source.setData({ type: 'FeatureCollection', features });

    const selectedSource = map.getSource('selected-object') as GeoJSONSource | undefined;
    if (!selectedSource) return;
    if (selected && Number.isFinite(selected.lat) && Number.isFinite(selected.lng)) {
      selectedSource.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [selected.lng, selected.lat] }, properties: {} }],
      });
    } else {
      selectedSource.setData({ type: 'FeatureCollection', features: [] });
    }
  };

  useEffect(() => {
    if (!holder.current) return;

    const map = new maplibregl.Map({
      container: holder.current,
      style: dark ? DARK_STYLE : LIGHT_STYLE,
      center: [120, 15],
      zoom: 5,
      minZoom: 1.2,
      maxZoom: 19,
      renderWorldCopies: true,
      attributionControl: false,
      cooperativeGestures: false,
    });

    mapRef.current = map;

    const handleLoad = () => {
      installLayers(map);
      syncData(map);
      syncUserLocation(map);
    };

    map.on('load', handleLoad);
    map.on('click', (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: LAYER_IDS.filter((id) => map.getLayer(id)) });
      const feature = features[0];
      if (feature?.properties?.id) {
        const item = itemsRef.current.find((candidate) => candidate.id === String(feature.properties.id));
        if (item) onSelectRef.current(item);
        return;
      }
      onMapClickRef.current(event.lngLat.lat, event.lngLat.lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [dark]);

  useEffect(() => {
    if (mapRef.current?.loaded()) {
      syncData(mapRef.current);
      syncUserLocation(mapRef.current);
    }
  }, [items, selected]);

  useEffect(() => {
    if (!mapRef.current?.loaded()) return;
    syncUserLocation(mapRef.current);
  }, [userLocation, followUser]);

  return <div className="map-host" ref={holder} aria-label="Interactive real map" />;
});

export default MapView;
