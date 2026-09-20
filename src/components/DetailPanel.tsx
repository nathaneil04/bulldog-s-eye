import { ExternalLink, MapPin, Trash2, X } from 'lucide-react';
import type { MapItem, Pin } from '../types';

export default function DetailPanel({ item, onClose, onFocus, onDelete }: { item: MapItem | Pin; onClose:()=>void; onFocus:()=>void; onDelete?:()=>void }) {
  const isPin = 'createdAt' in item;
  const detail = 'detail' in item ? item.detail : undefined;
  const entries = detail ? Object.entries(detail).filter(([,v]) => v !== null && v !== undefined && v !== '') .slice(0, 10) : [];
  return <aside className="detail panel"><div className="panel-head"><div><span className="eyebrow">OBJECT INSPECTOR</span><h2>{item.name}</h2></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div><div className="detail-meta"><span className="pill">{isPin ? 'PIN' : (item as MapItem).kind.toUpperCase()}</span><span className="source">{isPin ? 'God\'s Eye workspace' : (item as MapItem).source}</span></div>{!isPin && (item as MapItem).imageUrl && <img className="camera-image" src={(item as MapItem).imageUrl} alt={item.name}/>}<div className="coord"><MapPin size={15}/><span>{item.lat.toFixed(5)}, {item.lng.toFixed(5)}</span></div>{'altitude' in item && typeof item.altitude==='number' && <div className="stat-grid"><div><small>Altitude</small><b>{formatDistance(item.altitude)}</b></div>{typeof item.speed==='number'&&<div><small>Speed</small><b>{formatSpeed(item.speed)}</b></div>}{typeof item.heading==='number'&&<div><small>Heading</small><b>{Math.round(item.heading)}°</b></div>}</div>}<div className="kv">{entries.map(([k,v])=><div key={k}><span>{humanize(k)}</span><b>{formatValue(v)}</b></div>)}</div><div className="detail-actions"><button className="primary" onClick={onFocus}><MapPin size={16}/> Focus</button>{'imageUrl' in item && item.imageUrl && <a className="secondary" href={item.imageUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Open image</a>}{onDelete && <button className="danger" onClick={onDelete}><Trash2 size={16}/> Delete</button>}</div></aside>;
}
function humanize(s:string){return s.replace(/[A-Z]/g,m=>` ${m}`).replace(/[_-]/g,' ').replace(/^./,m=>m.toUpperCase());}
function formatValue(v:unknown){if(typeof v==='number')return v.toLocaleString(); if(typeof v==='object')return JSON.stringify(v); return String(v);}
function formatDistance(m:number){if(m>100000) return `${(m/1000).toFixed(0)} km`; return `${Math.round(m)} m`;}
function formatSpeed(mps:number){return `${(mps*3.6).toFixed(0)} km/h`;}
