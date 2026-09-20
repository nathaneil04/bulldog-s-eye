import { Building2, Loader2, MapPin, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MapItem } from '../types';
import { api } from '../lib/api';

interface Props {
  onClose: () => void;
  onSelect: (item: MapItem) => void;
  onFocus: (item: MapItem) => void;
}

export default function ExplorePanel({ onClose, onSelect, onFocus }: Props) {
  const [query, setQuery] = useState('community colleges');
  const [results, setResults] = useState<MapItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const search = async (value = query) => {
    const q = value.trim() || 'community colleges';
    setQuery(q);
    setLoading(true);
    setError('');
    try {
      const items = await api.communityColleges(q);
      setResults(items);
      setSearched(true);
    } catch (e) {
      setResults([]);
      setSearched(true);
      setError(String(e).replace('Error: ', '') || 'Community college search is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { search('community colleges'); }, []);

  return <section className="panel explore-panel">
    <div className="panel-head">
      <div><span className="eyebrow">WORLDWIDE POI SEARCH</span><h2>Community colleges</h2></div>
      <button className="icon-btn" onClick={onClose}><X size={18}/></button>
    </div>

    <div className="explore-search">
      <Search size={16}/>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') search(); }}
        placeholder="Gerona Community College, Philippines"
        aria-label="Search community colleges worldwide"
      />
      <button onClick={() => search()} disabled={loading} aria-label="Search">
        {loading ? <Loader2 size={15} className="spin-icon"/> : <Search size={15}/>} 
      </button>
    </div>

    <div className="explore-hints">
      <button onClick={() => search('community colleges in the Philippines')}>Philippines</button>
      <button onClick={() => search('community colleges in the United States')}>United States</button>
      <button onClick={() => search('Gerona Community College, Tarlac')}>Gerona Community College</button>
    </div>

    <div className="explore-note">
      <Building2 size={14}/>
      <span>Results are real OpenStreetMap-mapped POIs. Search finds the best matching mapped colleges; it is not a complete worldwide institution registry.</span>
    </div>

    <div className="explore-results">
      {loading && <div className="empty">Searching the world map…</div>}
      {!loading && error && <div className="empty">{error}</div>}
      {!loading && !error && searched && results.length === 0 && <div className="empty">No mapped community colleges matched that search.</div>}
      {!loading && !error && results.map(item => <button key={item.id} className="place-row" onClick={() => { onSelect(item); onFocus(item); }}>
        <span className="place-icon"><Building2 size={16}/></span>
        <span className="place-copy"><b>{item.name}</b><small>{String(item.detail?.displayName || item.source || 'OpenStreetMap')}</small><small>{item.lat.toFixed(4)}, {item.lng.toFixed(4)}</small></span>
        <MapPin size={15} className="muted"/>
      </button>)}
    </div>
  </section>;
}
