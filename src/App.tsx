import { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { RouteMap } from './components/RouteMap';
import { DashboardHome } from './components/DashboardHome';
import { DriverList } from './components/DriverList';
import { OrderList } from './components/OrderList';
import { Search, Bell, Settings } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'map' | 'drivers' | 'orders'>('map');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex h-screen w-full relative bg-[#0B0F19] text-slate-200 font-sans overflow-hidden">
      {/* Background simulated pattern similar to HTML */}
      <div className="absolute inset-0 opacity-20 pointer-events-none z-0">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
      </div>

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 min-w-0 overflow-hidden relative flex flex-col z-10">
        <header className="h-[64px] border-b border-white/5 flex items-center px-3 sm:px-8 justify-between shrink-0 bg-[#0B0F19]/80 backdrop-blur-2xl">
          <div className="text-[11px] tracking-widest uppercase font-bold flex items-center gap-4 text-slate-400">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </div>
            <span>OptiRoute Demo <span className="opacity-30 mx-2">/</span> <span className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">{activeTab}</span></span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <button aria-label="Search demo records" 
              onClick={() => {
                const query = window.prompt("Global Search:");
                if(query) alert(`Searching for "${query}"...`);
              }}
              className="p-2.5 hover:bg-white/10 rounded-full hover:text-white transition-all duration-300 outline-none focus:ring-2 focus:ring-blue-500/50 group"
            >
               <Search size={18} className="group-hover:scale-110 transition-transform" />
            </button>
            <div className="relative" ref={notifRef}>
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2.5 hover:bg-white/10 rounded-full hover:text-white transition-all duration-300 relative outline-none focus:ring-2 focus:ring-blue-500/50 group"
              >
                 <Bell size={18} className="group-hover:scale-110 transition-transform" />
                 <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-[1.5px] border-[#0B0F19]"></div>
              </button>
              
              {isNotificationsOpen && (
                <div className="absolute top-full right-0 mt-4 w-80 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-[1000] overflow-hidden">
                  <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="text-white font-semibold text-sm">Notifications</h3>
                    <span className="text-[10px] bg-white/10 text-white px-2 py-0.5 rounded-full">2 New</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    <div className="p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 mt-1.5 rounded-full bg-rose-500 shrink-0"></div>
                        <div>
                          <p className="text-sm text-slate-200">DRV-02 Delayed</p>
                          <p className="text-xs text-slate-400 mt-1">Sarah Connor is 15 minutes behind schedule on route RT-1043.</p>
                          <p className="text-[10px] text-slate-500 mt-2">10 mins ago</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 mt-1.5 rounded-full bg-slate-600 shrink-0"></div>
                        <div>
                          <p className="text-sm text-slate-200">Route Optimized</p>
                          <p className="text-xs text-slate-400 mt-1">System re-optimized routes for London Central territory.</p>
                          <p className="text-[10px] text-slate-500 mt-2">1 hr ago</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div 
                    onClick={() => {
                        setIsNotificationsOpen(false);
                        alert("All notifications marked as read.");
                    }}
                    className="p-2 bg-white/5 text-center cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    <span className="text-xs text-blue-400 font-medium">Mark all as read</span>
                  </div>
                </div>
              )}
            </div>
            <button 
              onClick={() => alert("Settings panel would open here.")}
              className="p-2.5 hover:bg-white/10 rounded-full hover:text-white transition-all duration-300 outline-none focus:ring-2 focus:ring-blue-500/50 group"
            >
               <Settings size={18} className="group-hover:rotate-45 transition-transform" />
            </button>
          </div>
        </header>
        <div className="flex-1 relative overflow-hidden flex flex-col">
           {activeTab === 'dashboard' && <DashboardHome />}
           {activeTab === 'map' && <RouteMap />}
           {activeTab === 'drivers' && <DriverList />}
           {activeTab === 'orders' && <OrderList />}
        </div>
      </main>
    </div>
  );
}
