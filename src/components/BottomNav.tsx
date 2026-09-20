import { Map, Layers3, MapPinned, Search, Settings2 } from 'lucide-react';

interface Props { active: string; setActive: (id: string) => void; }
export default function BottomNav({ active, setActive }: Props) {
  const items = [
    ['map', Map, 'Map'],
    ['layers', Layers3, 'Layers'],
    ['explore', Search, 'Explore'],
    ['pins', MapPinned, 'Pins'],
    ['settings', Settings2, 'Settings']
  ] as const;
  return <nav className="bottom-nav">{items.map(([id, Icon, label]) => <button key={id} className={active === id ? 'nav-btn active' : 'nav-btn'} onClick={() => setActive(id)}><Icon size={19}/><span>{label}</span></button>)}</nav>;
}
