import { LocateFixed, Mic, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props { onLocate: (lat: number, lng: number, label: string) => void; onVoice: () => void; listening: boolean; }
export default function SearchBar({ onLocate, onVoice, listening }: Props) {
  const [q,setQ]=useState(''); const [loading,setLoading]=useState(false); const [results,setResults]=useState<{lat:number;lng:number;displayName:string}[]>([]);
  useEffect(() => { const t=setTimeout(async()=>{ if(!q.trim()){setResults([]);return;} setLoading(true); try { const r=await fetch(`/api/geocode?q=${encodeURIComponent(q)}`); setResults(await r.json()); } catch { setResults([]); } finally { setLoading(false); } }, 450); return()=>clearTimeout(t); },[q]);
  return <div className="search-wrap"><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search a place, airport, vessel, coordinate..."/><button className={`voice-btn ${listening?'listening':''}`} onClick={onVoice} aria-label="Voice command"><Mic size={16}/></button>{q && <button className="clear-btn" onClick={()=>{setQ('');setResults([])}}><X size={15}/></button>}{results.length>0 && <div className="search-results">{results.map((r,i)=><button key={i} onClick={()=>{onLocate(r.lat,r.lng,r.displayName);setQ(r.displayName);setResults([])}}><LocateFixed size={15}/><span>{r.displayName}</span></button>)}</div>}{loading && <span className="search-loading"/>}</div>;
}
