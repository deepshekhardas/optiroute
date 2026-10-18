import React, { useState, useRef, useEffect } from 'react';
import { Truck, MoreHorizontal, X, Search, Edit, Trash, ChevronDown, ChevronUp, Percent, MapPin, Activity, Download } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '../lib/utils';
import { useFirestoreCollection } from '../lib/useFirestore';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

export function DriverList() {
  const { data: drivers, loading } = useFirestoreCollection<any>('drivers');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { user } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActionMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleExportCSV = () => {
    if (!drivers || drivers.length === 0) {
      showToast('No data to export.');
      return;
    }
    
    const headers = ['Driver ID', 'Name', 'Status', 'Vehicle', 'Capacity (Cubes)', 'Utilization (%)', 'Current Route'];
    
    const csvRows = drivers.map((driver: any) => [
      driver.id || '',
      `"${driver.name || ''}"`,
      driver.status || '',
      `"${driver.vehicle || ''}"`,
      driver.capacity || '',
      driver.utilization || '0',
      `"${driver.currentRoute || 'None'}"`
    ]);
    
    const csvContent = [headers.join(','), ...csvRows.map((row: any) => row.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `optiroute-drivers-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Drivers exported to CSV!');
  };

  const handleDelete = async (id: string) => {
    setActionMenuId(null);
    if (!window.confirm('Are you sure you want to delete this driver?')) return;
    try {
      await deleteDoc(doc(db, 'drivers', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'drivers');
    }
  };

  const handleEdit = (driver: any) => {
    setEditingDriver(driver);
    setIsModalOpen(true);
    setActionMenuId(null);
  };

  const handleAddSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const fd = new FormData(e.currentTarget);
    const newId = editingDriver ? editingDriver.id : `DRV-${Math.floor(Math.random() * 90) + 10}`;
    
    try {
      await setDoc(doc(db, 'drivers', newId), {
        userId: user.uid,
        name: fd.get('name'),
        status: fd.get('status'),
        vehicle: fd.get('vehicle'),
        capacity: Number(fd.get('capacity')),
        utilization: editingDriver ? editingDriver.utilization : 0,
        currentRoute: editingDriver ? editingDriver.currentRoute : null
      });
      setIsModalOpen(false);
      setEditingDriver(null);
      showToast(editingDriver ? 'Driver updated successfully!' : 'Driver created successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'drivers');
      showToast('Error saving driver.');
    }
  };

  if (loading) {
    return <div className="flex-1 p-8 text-slate-400">Loading drivers...</div>;
  }

  return (
    <div className="flex-1 overflow-auto p-8 max-w-7xl mx-auto w-full z-10 relative">
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-[9999] bg-emerald-500 text-white px-6 py-3 rounded-xl shadow-lg font-medium animate-in slide-in-from-bottom-5">
          {toastMessage}
        </div>
      )}
      <div className="flex justify-between items-end mb-8 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Driver Management</h1>
          <p className="text-slate-400 text-sm">Manage shifts, vehicles, and active routes.</p>
        </div>
        <div className="flex gap-3 relative z-20">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white px-5 py-2.5 font-bold text-sm rounded-xl transition-all shadow-md"
          >
            <Download size={16} /> Export CSV
          </button>
          <button 
            onClick={() => {
              setEditingDriver(null);
              setIsModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 font-bold text-sm rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-0.5"
          >
            Add Driver
          </button>
        </div>
      </div>

      <div className="mb-8 flex gap-4">
          <div className="relative flex-1 max-w-md group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 group-focus-within:text-blue-400 transition-colors" />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search drivers by name, ID, or vehicle..." 
              className="w-full bg-[#0F172A]/80 border border-white/5 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
            />
          </div>
      </div>

      <div className="bg-[#0F172A]/80 backdrop-blur-3xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
        <div className="grid grid-cols-6 p-4 border-b border-white/5 bg-white/5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <div className="col-span-2 pl-2">Driver</div>
          <div>Status</div>
          <div>Vehicle</div>
          <div>Location/Route</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y divide-white/10">
          {drivers
             .filter((driver: any) => 
               driver.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
               driver.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
               driver.vehicle?.toLowerCase().includes(searchTerm.toLowerCase())
             )
            .map((driver: any) => (
            <div key={driver.id} className="border-b border-white/[0.02] last:border-0 group transition-all">
              <div 
                className="grid grid-cols-6 p-4 items-center hover:bg-white/[0.03] cursor-pointer"
                onClick={() => setExpandedDriverId(expandedDriverId === driver.id ? null : driver.id)}
              >
                <div className="col-span-2 flex items-center gap-4 pl-2">
                  <button className="text-slate-500 hover:text-white transition-colors">
                    {expandedDriverId === driver.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-transparent p-[1px]">
                    <div className="w-full h-full rounded-full overflow-hidden bg-slate-900 border border-white/10">
                      <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${driver.name}`} alt={driver.name} className="w-full h-full object-cover opacity-90 group-hover:scale-110 transition-transform duration-500" />
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-white text-sm">{driver.name}</div>
                    <div className="text-xs text-slate-500">{driver.id}</div>
                  </div>
                </div>
                <div>
                  <span className={cn(
                    "inline-flex text-[10px] font-medium px-2 py-0.5 rounded border",
                    driver.status === 'active' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                    driver.status === 'idle' && "bg-slate-500/20 text-slate-400 border-slate-500/30",
                    driver.status === 'delayed' && "bg-rose-500/20 text-rose-400 border-rose-500/30",
                    driver.status === 'completed' && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                  )}>
                    {driver.status.charAt(0).toUpperCase() + driver.status.slice(1)}
                  </span>
                </div>
                <div className="text-sm">
                  <div className="font-medium text-slate-300 flex items-center gap-1.5"><Truck size={14} className="text-slate-500" /> {driver.vehicle}</div>
                  <div className="text-xs text-slate-500 mt-1">Cap: {driver.capacity} cubes</div>
                </div>
                <div className="text-sm">
                  {driver.currentRoute ? (
                    <div className="text-slate-300 font-mono text-xs truncate max-w-[150px]">{driver.currentRoute}</div>
                  ) : (
                    <div className="text-slate-500 text-xs">No assigned route</div>
                  )}
                </div>
                <div className="text-right relative" onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={() => setActionMenuId(actionMenuId === driver.id ? null : driver.id)}
                    className="p-2 text-slate-400 hover:text-white transition-opacity hover:bg-white/10 rounded-lg"
                  >
                     <MoreHorizontal size={18} />
                  </button>
                  {actionMenuId === driver.id && (
                    <div ref={menuRef} className="absolute right-0 top-full mt-1 w-36 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                      <button onClick={() => handleEdit(driver)} className="w-full text-left px-4 py-2 text-xs text-white hover:bg-white/10 transition-colors flex items-center gap-2">
                        <Edit size={12} /> Edit Driver
                      </button>
                      <button onClick={() => handleDelete(driver.id)} className="w-full text-left px-4 py-2 text-xs text-rose-400 hover:bg-white/10 transition-colors flex items-center gap-2">
                        <Trash size={12} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Expandable Details Section */}
              {expandedDriverId === driver.id && (
                <div className="px-6 py-4 bg-black/20 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <Activity size={14} /> Utilization
                        </div>
                        <div className="flex items-end gap-3">
                          <div className="text-2xl font-bold text-white">{driver.utilization || 0}%</div>
                          <div className="flex-1 mb-1.5 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all duration-1000",
                                (driver.utilization || 0) > 80 ? "bg-rose-500" : (driver.utilization || 0) > 50 ? "bg-amber-500" : "bg-blue-500"
                              )} 
                              style={{ width: `${driver.utilization || 0}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="h-20 w-full mt-4 bg-white/[0.02] border border-white/5 rounded-lg p-2">
                           <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={[
                                { name: 'Mon', value: 42 },
                                { name: 'Tue', value: 58 },
                                { name: 'Wed', value: 30 },
                                { name: 'Thu', value: Math.max(0, (driver.utilization || 0) - 20) },
                                { name: 'Fri', value: 65 },
                                { name: 'Sat', value: 70 },
                                { name: 'Sun', value: driver.utilization || 0 }
                              ]}>
                                 <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                 <Tooltip 
                                   contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                                   itemStyle={{ color: '#60a5fa' }}
                                   cursor={false}
                                 />
                              </LineChart>
                           </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                         <div className="text-xs text-slate-400 mb-1">Total Capacity</div>
                         <div className="font-medium text-white">{driver.capacity} cubic meters</div>
                      </div>
                    </div>
                    
                    <div className="col-span-2 space-y-4">
                       <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <MapPin size={14} /> Current Route Details
                          </div>
                          {driver.currentRoute ? (
                            <div className="bg-slate-900/50 border border-white/5 rounded-lg p-3 space-y-3">
                               <div className="flex justify-between items-center pb-2 border-b border-white/5">
                                  <span className="text-sm font-medium text-blue-400 font-mono">{driver.currentRoute}</span>
                                  <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">In Progress</span>
                               </div>
                               <div className="grid grid-cols-2 gap-4">
                                  <div>
                                     <div className="text-[10px] text-slate-500 uppercase tracking-wider">Next Stop</div>
                                     <div className="text-sm text-slate-300 truncate">789 High Street, Camden (ETA 10:15)</div>
                                  </div>
                                  <div>
                                     <div className="text-[10px] text-slate-500 uppercase tracking-wider">Remaining</div>
                                     <div className="text-sm text-slate-300">4 stops / 12 km</div>
                                  </div>
                               </div>
                            </div>
                          ) : (
                            <div className="bg-slate-900/50 border border-white/5 rounded-lg p-6 text-center">
                              <span className="text-slate-500 text-sm">Driver is currently idle. No route assigned.</span>
                            </div>
                          )}
                       </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0B0F19] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-xl font-bold text-white">{editingDriver ? 'Edit Driver' : 'Add New Driver'}</h2>
              <button onClick={() => { setIsModalOpen(false); setEditingDriver(null); }} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-6 flex flex-col gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Driver Name</label>
                <input required defaultValue={editingDriver?.name || ''} name="name" type="text" className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all" placeholder="e.g. Liam Patel" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Status</label>
                <select required defaultValue={editingDriver?.status || 'idle'} name="status" className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none cursor-pointer">
                  <option value="idle" className="bg-slate-800 text-white">Idle</option>
                  <option value="active" className="bg-slate-800 text-white">Active</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Vehicle Type</label>
                  <input required defaultValue={editingDriver?.vehicle || ''} name="vehicle" type="text" className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all" placeholder="e.g. Ford Transit" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Capacity (Cubes)</label>
                  <input required defaultValue={editingDriver?.capacity || ''} name="capacity" type="number" className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all" placeholder="e.g. 120" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/5 flex justify-end gap-3">
                <button type="button" onClick={() => { setIsModalOpen(false); setEditingDriver(null); }} className="px-5 py-2.5 text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 font-bold text-sm rounded-xl shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all">{editingDriver ? 'Save Changes' : 'Save Driver'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
