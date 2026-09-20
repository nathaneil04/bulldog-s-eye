import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Crosshair, Eye, Filter, Github, Info, Layers3, MapPinned, Plus, RefreshCw, Settings2, SlidersHorizontal, Sparkles, Wifi, X } from 'lucide-react';
import MapView, { type MapHandle, type UserLocation } from './components/MapView';
import LayerPanel from './components/LayerPanel';
import BottomNav from './components/BottomNav';
import SearchBar from './components/SearchBar';
import DetailPanel from './components/DetailPanel';
import ExplorePanel from './components/ExplorePanel';
import { api } from './lib/api';
import type { CustomSource, LayerId, MapItem, Pin } from './types';

const initialLayers: Record<LayerId, boolean> = { aircraft: true, vessels: false, satellites: true, earthquakes: true, traffic: false, cameras: false };

function flattenCoords(coords:any[]):any[]{ const out:any[]=[]; for(const x of coords){ if(Array.isArray(x)&&typeof x[0]==='number') out.push(x); else if(Array.isArray(x)) out.push(...flattenCoords(x)); } return out; }

export default function App(){
  const map = useRef<MapHandle>(null);
  const [activeNav,setActiveNav]=useState('map');
  const [enabled,setEnabled]=useState<Record<LayerId,boolean>>(initialLayers);
  const [data,setData]=useState<Partial<Record<LayerId,MapItem[]>>>({});
  const [pins,setPins]=useState<Pin[]>([]);
  const [selected,setSelected]=useState<MapItem|Pin|null>(null);
  const [loading,setLoading]=useState<Record<string,boolean>>({});
  const [darkMap,setDarkMap]=useState(true);
  const [status,setStatus]=useState('Connecting to public data…');
  const [notice,setNotice]=useState('');
  const [customSources,setCustomSources]=useState<CustomSource[]>([]);
  const [customItems,setCustomItems]=useState<MapItem[]>([]);
  const [showQuick,setShowQuick]=useState(false);
  const [pinMode,setPinMode]=useState(false);
  const [showAbout,setShowAbout]=useState(false);
  const [voiceListening,setVoiceListening]=useState(false);
  const [sourceModal,setSourceModal]=useState(false);
  const [sourceName,setSourceName]=useState('');
  const [sourceUrl,setSourceUrl]=useState('');
  const [sourceType,setSourceType]=useState<'geojson'|'json'>('geojson');
  const [userLocation,setUserLocation]=useState<UserLocation|null>(null);
  const [locationActive,setLocationActive]=useState(false);
  const [followUser,setFollowUser]=useState(true);
  const [locationAccuracy,setLocationAccuracy]=useState<number|null>(null);
  const locationWatchRef=useRef<number|null>(null);

  const mergedItems=useMemo(()=>Object.values(data).flatMap(x=>x||[]).concat(customItems).concat(pins.map(p=>({...p,kind:'pin' as const}))),[data,customItems,pins]);
  const counts=useMemo(()=>Object.fromEntries((Object.keys(initialLayers) as LayerId[]).map(k=>[k,data[k]?.length||0])) as Partial<Record<LayerId,number>>, [data]);

  useEffect(()=>()=>{ if(locationWatchRef.current!==null) navigator.geolocation?.clearWatch(locationWatchRef.current); },[]);

  const stopLocationTracking=useCallback(()=>{
    if(locationWatchRef.current!==null && navigator.geolocation){
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current=null;
    }
    setLocationActive(false);
    setFollowUser(false);
    setNotice('Live location stopped.');
  },[]);

  const startLocationTracking=useCallback(()=>{
    if(!navigator.geolocation){ setNotice('Live location is not supported by this browser.'); return; }
    if(locationWatchRef.current!==null){
      setFollowUser(true);
      if(userLocation) map.current?.focus(userLocation.lat,userLocation.lng,Math.max(15,12));
      return;
    }
    setLocationActive(true);
    setFollowUser(true);
    setStatus('Requesting your live location…');
    locationWatchRef.current=navigator.geolocation.watchPosition((position)=>{
      const next={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy};
      setUserLocation(next);
      setLocationAccuracy(position.coords.accuracy);
      setStatus(`LIVE LOCATION · ±${Math.round(position.coords.accuracy)} m · ${new Date().toLocaleTimeString()}`);
      setNotice('Live location is on. Your position will update as you move.');
    },(error)=>{
      const messages:Record<number,string>={1:'Location permission was denied. Allow location access in your browser settings.',2:'Your location is currently unavailable.',3:'Location request timed out.'};
      setLocationActive(false);
      if(locationWatchRef.current!==null && navigator.geolocation){ navigator.geolocation.clearWatch(locationWatchRef.current); locationWatchRef.current=null; }
      setNotice(messages[error.code]||'Could not get your location.');
      setStatus('Location unavailable.');
    },{enableHighAccuracy:true,maximumAge:3000,timeout:15000});
  },[userLocation]);

  const handleLocate=()=>{
    if(!locationActive){ startLocationTracking(); return; }
    if(userLocation){
      setFollowUser(true);
      map.current?.focus(userLocation.lat,userLocation.lng,16);
      setNotice(`Centered on your location · ±${Math.round(locationAccuracy||userLocation.accuracy||0)} m`);
    }
  };

  const loadLayer=useCallback(async (id:LayerId)=>{
    setLoading(s=>({...s,[id]:true}));
    try{
      const fn:any={aircraft:api.aircraft,vessels:api.vessels,satellites:api.satellites,earthquakes:api.earthquakes,traffic:api.traffic,cameras:api.cameras}[id];
      const items=await fn(); setData(s=>({...s,[id]:Array.isArray(items)?items:items.items||[]})); setStatus(`${id} layer refreshed · ${new Date().toLocaleTimeString()}`);
    }catch(e){ setNotice(`Could not load ${id}: ${String(e).replace('Error: ','')}`); setStatus('Some public feeds are unavailable or rate-limited.'); }
    finally{setLoading(s=>({...s,[id]:false})); }
  },[]);

  const loadCustomSource=useCallback(async (source:CustomSource)=>{
    try{
      const raw=await fetch(`/api/source-data?url=${encodeURIComponent(source.url)}`).then(r=>r.json());
      const features=Array.isArray(raw?.features)?raw.features:Array.isArray(raw)?raw:[];
      const items:MapItem[]=features.slice(0,1200).flatMap((f:any,idx:number)=>{
        const g=f?.geometry; const p=f?.properties||f;
        let lat:number|undefined; let lng:number|undefined;
        if(Array.isArray(g?.coordinates)&&typeof g.coordinates[0]==='number'){lng=Number(g.coordinates[0]);lat=Number(g.coordinates[1]);}
        else if(Array.isArray(g?.coordinates)){ const pts=flattenCoords(g.coordinates).filter((v:any)=>Array.isArray(v)&&typeof v[0]==='number'); if(pts.length){lng=pts.reduce((a:any,v:any)=>a+Number(v[0]),0)/pts.length;lat=pts.reduce((a:any,v:any)=>a+Number(v[1]),0)/pts.length;} }
        else if(Number.isFinite(Number(f?.lat))&&Number.isFinite(Number(f?.lon??f?.lng))){lat=Number(f.lat);lng=Number(f.lon??f.lng);}
        if(!Number.isFinite(lat)||!Number.isFinite(lng))return [];
        return [{id:`src-${source.id}-${idx}`,kind:'source' as const,name:String(p?.name||p?.title||source.name),lat:Number(lat),lng:Number(lng),source:source.name,detail:p}];
      });
      setCustomItems(prev=>[...prev.filter(x=>x.source!==source.name),...items]);
    }catch(e){setNotice(`Custom source unavailable: ${source.name}`)}
  },[]);
  useEffect(()=>{ api.pins().then(setPins).catch(()=>{}); api.sources().then(s=>{setCustomSources(s);s.forEach(loadCustomSource)}).catch(()=>{}); loadLayer('aircraft'); loadLayer('satellites'); loadLayer('earthquakes'); },[loadLayer,loadCustomSource]);
  useEffect(()=>{ (Object.keys(enabled) as LayerId[]).filter(x=>enabled[x] && !data[x]).forEach(loadLayer); },[enabled, data, loadLayer]);
  useEffect(()=>{ const t=setInterval(()=>{ if(enabled.aircraft)loadLayer('aircraft'); if(enabled.earthquakes)loadLayer('earthquakes'); if(enabled.vessels)loadLayer('vessels'); if(enabled.traffic)loadLayer('traffic'); if(enabled.cameras)loadLayer('cameras'); }, 60_000); return()=>clearInterval(t); },[enabled,loadLayer]);

  const handleMapClick=async(lat:number,lng:number)=>{
    if(!pinMode) return;
    const name=prompt('Pin name', `Pinned location ${lat.toFixed(3)}, ${lng.toFixed(3)}`);
    if(!name) return;
    try{const pin=await api.createPin({name,lat,lng}); setPins(p=>[pin,...p]); setSelected(pin); setPinMode(false); setNotice('Pin saved.');}catch(e){setNotice(`Could not save pin: ${e}`)}
  };

  const handleVoice=()=>{
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!SR){setNotice('Voice recognition is not supported in this browser. Use Chrome or Edge.');return;}
    const recognition=new SR(); recognition.lang='en-US'; recognition.interimResults=false; recognition.maxAlternatives=1;
    recognition.onstart=()=>setVoiceListening(true); recognition.onend=()=>setVoiceListening(false);
    recognition.onerror=()=>{setVoiceListening(false);setNotice('Voice recognition failed. Check browser microphone permission.');};
    recognition.onresult=async(e:any)=>{
      const text=String(e.results?.[0]?.[0]?.transcript||'').toLowerCase();
      setNotice(`Voice: “${text}”`);
const layerKeywords: Partial<Record<LayerId, string[]>> = {
  aircraft: ['aircraft', 'planes', 'flight'],
  vessels: ['vessel', 'ship', 'ships', 'marine'],
  satellites: ['satellite', 'satellites', 'orbit'],
  earthquakes: ['earthquake', 'earthquakes', 'quake'],
  traffic: ['traffic', 'roads'],
  cameras: ['camera', 'cameras', 'webcam'],
};      for (const [id, words] of Object.entries(layerKeywords) as [LayerId, string[]][]) if(words.some(w=>text.includes(w))) setEnabled(s=>({...s,[id]:true}));
      if(text.includes('pin') && (text.includes('mode')||text.includes('enable'))) {setPinMode(true);setNotice('Pin mode enabled. Click anywhere on the map.');}
      const at=text.split(' at ')[1] || text.split(' to ')[1];
      if(at && at.length>2 && !['aircraft','traffic','satellites'].some(x=>at.includes(x))){ try{ const r=await api.geocode(at); if(r[0]){map.current?.focus(r[0].lat,r[0].lng,12);setNotice(`Focused on ${r[0].displayName}`);} }catch{} }
    };
    recognition.start();
  };

  const addSource=async()=>{ if(!sourceName||!sourceUrl)return; try{const s=await api.createSource({name:sourceName,url:sourceUrl,type:sourceType});setCustomSources(x=>[s,...x]);await loadCustomSource(s);setSourceModal(false);setSourceName('');setSourceUrl('');setNotice('Custom source saved and loaded.');}catch(e){setNotice(`Could not add source: ${e}`)} };
  const deletePin=async(id:string)=>{await api.deletePin(id);setPins(p=>p.filter(x=>x.id!==id));setSelected(null)};
  const deleteSource=async(id:string)=>{const src=customSources.find(x=>x.id===id);await api.deleteSource(id);setCustomSources(s=>s.filter(x=>x.id!==id));if(src)setCustomItems(items=>items.filter(x=>x.source!==src.name));};

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Eye size={22}/></div><div><b>BULLDOGS'S EYE</b><span>EXPLORE THE WORLD THROUGHT LIVE MAP</span></div></div>
      <SearchBar onLocate={(lat,lng,label)=>{map.current?.focus(lat,lng,11);setSelected({id:`search-${lat}-${lng}`,kind:'pin',name:label.split(',')[0]||'Search result',lat,lng});}} onVoice={handleVoice} listening={voiceListening}/>
      <div className="top-actions"><button className="icon-btn" onClick={()=>setDarkMap(x=>!x)} title="Toggle dark map"><Activity size={17}/></button><button className="icon-btn" onClick={()=>setShowAbout(true)} title="About"><Info size={17}/></button><span className="live-dot"><span/>LIVE</span></div>
    </header>

    <aside className="side-rail">
      <button className={`rail-btn ${activeNav==='map'?'active':''}`} onClick={()=>setActiveNav('map')}><Eye/><span>Map</span></button>
      <button className={`rail-btn ${activeNav==='layers'?'active':''}`} onClick={()=>setActiveNav('layers')}><Layers3/><span>Layers</span></button>
      <button className={`rail-btn ${activeNav==='explore'?'active':''}`} onClick={()=>setActiveNav('explore')}><Filter/><span>Explore</span></button>
      <button className={`rail-btn ${activeNav==='pins'?'active':''}`} onClick={()=>setActiveNav('pins')}><MapPinned/><span>Pins</span></button>
      <button className={`rail-btn ${activeNav==='settings'?'active':''}`} onClick={()=>setActiveNav('settings')}><Settings2/><span>Settings</span></button>
      <div className="rail-spacer"/><button className="rail-btn" onClick={()=>setShowAbout(true)}><Github/><span>About</span></button>
    </aside>

    <main className="main-stage">
      <div className="map-wrap"><MapView ref={map} items={mergedItems} selected={selected as MapItem | null} onSelect={(item)=>setSelected(item)} onMapClick={handleMapClick} dark={darkMap} userLocation={userLocation} followUser={followUser}/></div>
      <div className="hud hud-left"><div className="hud-title"><span className="eyebrow">LIVE MAP</span><h1>One map. Many signals.</h1></div><div className="hud-cards"><div><b>{mergedItems.length.toLocaleString()}</b><span>visible objects</span></div><div><b>{pins.length}</b><span>saved pins</span></div></div></div>
      <div className="hud hud-bottom"><span><Wifi size={14}/> {status}</span><span className="coords">Pan to move · Scroll to zoom · Click a signal to inspect{locationActive?' · Blue dot = your live position':''}</span></div>
      <div className="floating-tools"><button className={locationActive?'tool active location-tool':'tool location-tool'} onClick={handleLocate} title={locationActive?'Center on my live location':'Use my live location'}><Crosshair size={17}/><span>{locationActive?(followUser?'Following me':'My location'):'My location'}</span></button>{locationActive && <button className="tool location-live" onClick={()=>setFollowUser(x=>!x)} title={followUser?'Stop auto-following while keeping location live':'Follow my live location'}><span>● {followUser?'FOLLOW':'LIVE'}</span></button>}<button className={pinMode?'tool active':'tool'} onClick={()=>setPinMode(x=>!x)}><Plus size={17}/><span>{pinMode?'Tap map':'Add pin'}</span></button><button className="tool" onClick={()=>{setShowQuick(x=>!x)}}><SlidersHorizontal size={17}/><span>Quick</span></button></div>

      {showQuick && <div className="quick-panel panel"><div className="panel-head"><div><span className="eyebrow">QUICK CONTROLS</span><h2>Scene</h2></div><button className="icon-btn" onClick={()=>setShowQuick(false)}><X size={17}/></button></div><label className="check"><input type="checkbox" checked={darkMap} onChange={e=>setDarkMap(e.target.checked)}/><span/>Dark map style</label>{locationActive && <button className="danger wide" onClick={stopLocationTracking}><Crosshair size={16}/> Stop live location</button>}<button className="secondary wide" onClick={()=>{(Object.keys(initialLayers) as LayerId[]).forEach(id=>loadLayer(id));setNotice('Refreshing all layers…')}}><RefreshCw size={16}/> Refresh public feeds</button></div>}

      {activeNav==='explore' && <div className="overlay-panel"><ExplorePanel onClose={()=>setActiveNav('map')} onSelect={(item)=>setSelected(item)} onFocus={(item)=>{map.current?.focus(item.lat,item.lng,14)}}/></div>}
      {activeNav==='layers' && <div className="overlay-panel"><LayerPanel enabled={enabled} setEnabled={(id,val)=>setEnabled(s=>({...s,[id]:val}))} counts={counts} onClose={()=>setActiveNav('map')}/></div>}
      {activeNav==='pins' && <div className="overlay-panel"><section className="panel"><div className="panel-head"><div><span className="eyebrow">WORKSPACE</span><h2>Saved pins</h2></div><button className="icon-btn" onClick={()=>setActiveNav('map')}><X size={18}/></button></div><button className="primary wide" onClick={()=>{setPinMode(true);setActiveNav('map');setNotice('Pin mode enabled. Click the map.')}}><Plus size={16}/> Add pin on map</button><div className="list">{pins.length===0&&<div className="empty">No pins yet. Click the map after enabling pin mode.</div>}{pins.map(p=><button className="list-row" key={p.id} onClick={()=>{setSelected(p);map.current?.focus(p.lat,p.lng,12)}}><MapPinned size={16}/><span><b>{p.name}</b><small>{p.lat.toFixed(3)}, {p.lng.toFixed(3)}</small></span></button>)}</div></section></div>}
      {activeNav==='settings' && <div className="overlay-panel"><section className="panel"><div className="panel-head"><div><span className="eyebrow">SYSTEM</span><h2>Settings</h2></div><button className="icon-btn" onClick={()=>setActiveNav('map')}><X size={18}/></button></div><label className="setting"><span>Dark map style</span><input type="checkbox" checked={darkMap} onChange={e=>setDarkMap(e.target.checked)}/></label><button className="secondary wide" onClick={()=>setSourceModal(true)}><Plus size={16}/> Add custom data source</button><div className="custom-source-list">{customSources.map(s=><div className="source-card" key={s.id}><div><b>{s.name}</b><small>{s.type.toUpperCase()} · {s.url}</small></div><button className="icon-btn" onClick={()=>deleteSource(s.id)}>×</button></div>)}</div></section></div>}
      {selected && <div className="overlay-detail"><DetailPanel item={selected} onClose={()=>setSelected(null)} onFocus={()=>map.current?.focus(selected.lat,selected.lng,13)} onDelete={'createdAt' in selected?()=>deletePin(selected.id):undefined}/></div>}
    </main>
    <BottomNav active={activeNav} setActive={setActiveNav}/>

    {notice && <button className="toast" onClick={()=>setNotice('')}>{notice}<span>×</span></button>}
    {sourceModal && <div className="modal-backdrop"><div className="modal panel"><div className="panel-head"><div><span className="eyebrow">CUSTOM SOURCE</span><h2>Connect data</h2></div><button className="icon-btn" onClick={()=>setSourceModal(false)}><X size={18}/></button></div><p className="muted-text">Add a public GeoJSON/JSON URL. The backend fetches it through a server-side proxy to avoid browser CORS problems.</p><input className="field" value={sourceName} onChange={e=>setSourceName(e.target.value)} placeholder="Layer name"/><input className="field" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://example.com/data.geojson"/><div className="segmented"><button className={sourceType==='geojson'?'active':''} onClick={()=>setSourceType('geojson')}>GeoJSON</button><button className={sourceType==='json'?'active':''} onClick={()=>setSourceType('json')}>JSON</button></div><button className="primary wide" onClick={addSource}><Sparkles size={16}/> Save source</button></div></div>}
    {showAbout && <div className="modal-backdrop"><div className="modal panel"><div className="panel-head"><div><span className="eyebrow">ABOUT</span><h2>God's Eye</h2></div><button className="icon-btn" onClick={()=>setShowAbout(false)}><X size={18}/></button></div><div className="about-copy"><p>God's Eye fuses public/open geospatial feeds into one interactive map so you can move from a global overview to individual signals and saved locations.</p><p className="muted-text">Aircraft: OpenSky · Earthquakes: USGS · Satellites: CelesTrak · AIS/road traffic/cameras: Digitraffic · Search: OpenStreetMap Nominatim.</p><a href="https://github.com/" target="_blank" rel="noreferrer" className="secondary wide"><Github size={16}/> Project-ready starter</a></div></div></div>}
  </div>
}
