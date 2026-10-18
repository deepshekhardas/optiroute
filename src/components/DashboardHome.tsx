import { useState } from 'react';
import { Truck, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useFirestoreCollection } from '../lib/useFirestore';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function DashboardHome() {
  const { data: drivers, loading: driversLoading } = useFirestoreCollection<any>('drivers');
  const { data: orders, loading: ordersLoading } = useFirestoreCollection<any>('orders');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  
  if (driversLoading || ordersLoading) {
    return <div className="flex-1 p-8 text-slate-400">Loading metrics...</div>;
  }

  const handleSolve = async () => {
    setIsOptimizing(true);
    try {
      const available = drivers.filter((d:any) => ['active','idle'].includes(d.status)).map((d:any) => ({...d, remaining: Math.max(0, Number(d.capacity) || 0)})).sort((a:any,b:any) => String(a.id).localeCompare(String(b.id)));
      const delayed = new Set(drivers.filter((d:any) => d.status === 'delayed').map((d:any) => d.id));
      for (const order of orders.filter((o:any) => o.driver && !delayed.has(o.driver) && o.status !== 'delivered')) {
        const driver = available.find((d:any) => d.id === order.driver);
        if (driver) driver.remaining = Math.max(0, driver.remaining - (Number(order.volume) || 0));
      }
      const proposed = orders.filter((o:any) => o.status !== 'delivered' && (!o.driver || delayed.has(o.driver))).sort((a:any,b:any) => String(a.id).localeCompare(String(b.id)));
      const rows = proposed.map((o:any) => {
        const volume = Number(o.volume);
        if (!Number.isFinite(volume) || volume < 0) return o.id + ': invalid sample volume';
        const driver = available.find((d:any) => d.remaining >= volume);
        if (!driver) return o.id + ': no available capacity';
        driver.remaining -= volume;
        return o.id + ' → ' + driver.id;
      });
      window.alert('Demo assignment preview — deterministic capacity-based heuristic, not optimal routing. No dispatch or database changes.\n\n' + (rows.join('\n') || 'No unassigned or delayed sample orders need reassignment.'));
    } finally { setIsOptimizing(false); }
  };
  const activeDrivers = drivers.filter(d => d.status === 'active').length;
  const delayedDriversList = drivers.filter(d => d.status === 'delayed');
  const delayedDrivers = delayedDriversList.length;
  const idleDriversList = drivers.filter(d => d.status === 'idle');
  const completedOrders = orders.filter(o => o.status === 'delivered').length;
  const unassignedOrdersCount = orders.filter(o => !o.driver).length;
  const totalOrders = orders.length;

  // Generate dynamic chart data based on order volumes
  // Just simulate it based on total orders for now to make it look dynamic based on DB size
  const dynamicChartData = [
    { time: '08:00', deliveries: Math.floor(completedOrders * 0.1) },
    { time: '10:00', deliveries: Math.floor(totalOrders * 0.3) },
    { time: '12:00', deliveries: Math.floor(totalOrders * 0.5) },
    { time: '14:00', deliveries: Math.floor(totalOrders * 0.7) },
    { time: '16:00', deliveries: Math.floor(totalOrders * 0.8) },
    { time: '18:00', deliveries: totalOrders },
  ];
  
  return (
    <div className="flex-1 overflow-auto p-8 max-w-7xl mx-auto w-full z-10 relative">
      <h1 className="text-3xl font-bold tracking-tight text-white mb-8">Fleet Overview</h1>
      {optimizationError && <p role="alert" className="mb-4 rounded-xl border border-rose-500/30 p-4 text-rose-300">{optimizationError}</p>}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard title="Active Drivers" value={activeDrivers.toString()} icon={Truck} subtext="Current driver records" />
        <StatCard title="Delivered Orders" value={`${completedOrders}/${totalOrders}`} icon={CheckCircle2} subtext="Current order records" valueColor="text-emerald-400" />
        <StatCard title="Delayed Vehicles" value={delayedDrivers.toString()} icon={AlertTriangle} subtext="Current status records" alert />
        <StatCard title="Demo Efficiency" value="94.2%" icon={Clock} subtext="Illustrative metric, not measured" valueColor="text-blue-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">Illustrative Delivery Trend — Sample Chart</h2>
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dynamicChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dx={-10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(12px)', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                  itemStyle={{ color: '#60a5fa' }} 
                />
                <Line type="monotone" dataKey="deliveries" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#0f172a' }} activeDot={{ r: 6, fill: '#60a5fa' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 flex flex-col">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6 flex items-center justify-between">
            Attention Required
            {(delayedDrivers > 0 || (idleDriversList.length > 0 && unassignedOrdersCount > 0)) && (
               <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            )}
          </h2>
          
          <div className="space-y-4 flex-1">
            {delayedDriversList.map((driver) => (
              <div key={driver.id} className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-rose-400 text-sm">Delay: {driver.id}</span>
                  <span className="text-[10px] font-medium text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded">Now</span>
                </div>
                <p className="text-xs text-rose-200 opacity-80 leading-relaxed">{driver.name} is currently delayed on route. Action required to re-optimize current route plan.</p>
                <button 
                  onClick={handleSolve}
                  disabled={isOptimizing}
                  className="mt-3 text-[10px] uppercase tracking-widest font-bold text-white hover:text-rose-300 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {isOptimizing ? 'Optimizing...' : 'Preview reassignment'} <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </button>
              </div>
            ))}

            {(idleDriversList.length > 0 && unassignedOrdersCount > 0) && (
              <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-orange-400 text-sm">Idle Drivers: {idleDriversList.length}</span>
                  <span className="text-[10px] font-medium text-orange-300 bg-orange-500/20 px-2 py-0.5 rounded">Action</span>
                </div>
                <p className="text-xs text-orange-200 opacity-80 leading-relaxed">There are {unassignedOrdersCount} unassigned orders waiting and {idleDriversList.length} drivers available.</p>
                <button 
                  onClick={handleSolve}
                  disabled={isOptimizing}
                  className="mt-3 text-[10px] uppercase tracking-widest font-bold text-white hover:text-orange-300 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {isOptimizing ? 'Assigning...' : 'Assign Orders'} <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </button>
              </div>
            )}
            
            {(delayedDriversList.length === 0 && (idleDriversList.length === 0 || unassignedOrdersCount === 0)) && (
               <div className="flex flex-col items-center justify-center p-6 text-slate-500 text-sm h-full font-medium">
                 <CheckCircle2 size={32} className="mb-2 text-emerald-500/50" />
                 All systems nominal
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, subtext, alert, valueColor = "text-white" }: { title: string, value: string, icon: any, subtext: string, alert?: boolean, valueColor?: string }) {
  return (
    <div className={`p-5 rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${alert ? 'border-rose-500/30 bg-gradient-to-br from-rose-500/10 to-transparent shadow-rose-500/5' : 'border-white/5 bg-gradient-to-br from-white/5 to-transparent hover:border-white/10 shadow-black/20'}`}>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex justify-between items-center">
        {title}
        <div className={`p-2 rounded-lg ${alert ? 'bg-rose-500/20' : 'bg-white/5'}`}>
           <Icon size={16} className={alert ? 'text-rose-400' : 'text-slate-300'} />
        </div>
      </div>
      <div className={`text-3xl font-black tracking-tight ${alert ? 'text-rose-400' : valueColor} mb-1 drop-shadow-sm`}>{value}</div>
      <div className={`text-xs font-medium ${alert ? 'text-rose-300' : 'text-slate-500'}`}>{subtext}</div>
    </div>
  );
}
