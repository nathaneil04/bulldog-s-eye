import { Camera, CarFront, ChevronRight, Radio, Satellite, Ship, Waves } from 'lucide-react';
import type { LayerId } from '../types';

interface Props { enabled: Record<LayerId, boolean>; setEnabled: (id: LayerId, value: boolean) => void; counts: Partial<Record<LayerId, number>>; onClose?: () => void; }
export default function LayerPanel({ enabled, setEnabled, counts, onClose }: Props) {
  const rows = [
    ['aircraft','Aircraft',Radio], ['vessels','Vessels',Ship], ['satellites','Satellites',Satellite], ['earthquakes','Earthquakes',Waves], ['traffic','Traffic',CarFront], ['cameras','Cameras',Camera]
  ] as const;
  return <section className="panel layer-panel"><div className="panel-head"><div><span className="eyebrow">LIVE LAYERS</span><h2>World signals</h2></div>{onClose && <button className="icon-btn" onClick={onClose}>×</button>}</div>{rows.map(([id,label,Icon]) => <button className="layer-row" key={id} onClick={() => setEnabled(id, !enabled[id])}><span className={`layer-icon ${enabled[id] ? 'on' : ''}`}><Icon size={16}/></span><span className="layer-copy"><b>{label}</b><small>{enabled[id] ? `${counts[id] ?? 0} objects` : 'Layer off'}</small></span><span className={`toggle ${enabled[id] ? 'on' : ''}`}><span/></span><ChevronRight size={15} className="muted"/></button>)}</section>;
}
