# God's Eye — Live Open Data Mapping PWA

God's Eye is a black/gray full-stack progressive web app for exploring public geospatial data in a real interactive 2D map UI.

## Included

- Real 2D interactive mapping using MapLibre GL JS + OpenFreeMap vector tiles.
- Pan, zoom, map controls, real geographic coordinates, map search, layer visibility, and selectable mapped objects.
- Real pinning: click the map to create a pin; pins persist through the Express backend.
- Live device location: uses the browser Geolocation API to show a blue position marker, a real accuracy area, continuous movement updates, and optional auto-follow/center controls. Location is requested only after the user taps My location.
- Search + geocoding through Nominatim/OpenStreetMap.
- Live aircraft layer from OpenSky Network.
- Vessel/AIS layer from Finland's Digitraffic marine API.
- Satellite positions from CelesTrak station TLEs, propagated with `satellite.js`.
- Earthquake layer from USGS GeoJSON real-time feed.
- Traffic layer from Digitraffic's current road-traffic messages, with optional TomTom adapter.
- Public road-weather camera layer from Digitraffic with image links.
- Custom GeoJSON/JSON data-source layer registration.
- Voice Copilot using the browser Speech Recognition API for layer and place commands.
- Responsive bottom navigation designed for phones/tablets + a desktop side rail.
- Dark/light map style toggle using OpenFreeMap styles and MapLibre controls.
- PWA manifest + auto-updating service worker.

## Live location

Tap **My location** in the map controls. On the first use, the browser will ask for location permission. While enabled, `watchPosition()` continuously updates the blue location marker and accuracy area; **Follow** keeps the map centered on you, while **LIVE** lets you keep tracking without automatic recentering. Use Quick Controls → Stop live location to stop the watch.

For a deployed PWA, serve the app over HTTPS (Vercel provides HTTPS).

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:8787

Build:

```bash
npm run build
```

## Notes on public-data providers

The out-of-the-box layers are deliberately based on public/open interfaces. Some providers have geographic scope or usage/rate limits. OpenSky can be used anonymously within its current limits or with OAuth client credentials. CelesTrak asks applications to retrieve only the GP data they need and not more often than its update cadence. Digitraffic asks applications to identify themselves and respect request limits.

The camera layer is based on public road-weather cameras rather than private/security-camera feeds. Custom camera/data sources are only loaded when the user explicitly adds a URL.

## Safety / data-use note

God's Eye is designed for public/open geospatial data. Public feeds may be delayed, incomplete, rate-limited, or geographically limited. The included camera integration uses public road-weather cameras, not private/security camera access. Do not use displayed data as the sole basis for emergency response, navigation, or other high-stakes decisions.

## Production deployment

The frontend can be deployed as a static PWA to Vercel/Netlify/etc. The Express backend should be deployed separately to a Node-capable host, or its routes should be moved into the platform's serverless functions. When separated, set `VITE_API_BASE_URL` in the frontend build environment to the backend's public URL. The included JSON file store is intended as a simple local/demo persistence layer; use a managed database for multi-user production deployment.

## Worldwide community-college search
The Explore tab searches OpenStreetMap-mapped college POIs through the backend's Nominatim proxy. Search examples include `Gerona Community College`, `community colleges in the Philippines`, and `community colleges in the United States`. Nominatim returns best-matching results rather than a complete worldwide institution registry.
