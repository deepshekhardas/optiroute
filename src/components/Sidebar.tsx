import { Map, Users, ListFilter, Activity } from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  activeTab: 'dashboard' | 'map' | 'drivers' | 'orders';
  setActiveTab: (tab: 'dashboard' | 'map' | 'drivers' | 'orders') => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const navItems = [
    { id: 'dashboard', icon: Activity, label: 'Overview' },
    { id: 'map', icon: Map, label: 'Planner' },
    { id: 'drivers', icon: Users, label: 'Drivers' },
    { id: 'orders', icon: ListFilter, label: 'Orders' },
  ] as const;

  return (
    <aside className="w-[80px] shrink-0 h-full bg-slate-950/80 backdrop-blur-2xl border-r border-white/5 py-6 flex flex-col items-center z-20">
      <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-blue-400 text-white flex items-center justify-center rounded-xl font-bold shadow-lg shadow-blue-500/30 mb-12 transition-transform hover:scale-105 cursor-pointer">
        <Map size={20} />
      </div>

      <nav className="flex flex-col gap-6 flex-1 w-full px-4">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "relative group flex p-3 rounded-xl flex-col items-center gap-2 transition-all duration-300 w-full",
              activeTab === item.id 
                ? "text-white bg-white/10 shadow-[inset_0_1px_rgba(255,255,255,0.1)]" 
                : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
            )}
          >
            <item.icon size={22} strokeWidth={activeTab === item.id ? 2 : 1.5} className="transition-transform group-hover:scale-110" />
            <span className="text-[9px] uppercase font-bold tracking-wider opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-6 whitespace-nowrap z-50 bg-slate-800 px-2 py-1 rounded-md shadow-xl border border-white/10 pointer-events-none">
              {item.label}
            </span>
            {activeTab === item.id && (
              <span className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-6 pb-6 w-full">
        <hr className="w-8 border-t border-white/10" />
        <button className="w-10 h-10 rounded-full bg-white/5 relative overflow-hidden ring-2 ring-transparent hover:ring-white/20 transition-all outline-none focus:ring-blue-500/50 shadow-md">
          <img src="https://i.pravatar.cc/100?img=33" alt="User" className="w-full h-full object-cover" />
        </button>
      </div>
    </aside>
  );
}
