import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Play, Package, Truck, Settings2 } from 'lucide-react';
import { useFirestoreCollection } from '../lib/useFirestore';
import { doc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

// Fix leaflet default icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Since the default map background will be light from tailwind base layer, we can override the map container's bg
const customIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const unassignedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function MapControls({ onZoomIn, onZoomOut }: { onZoomIn: React.MutableRefObject<() => void>, onZoomOut: React.MutableRefObject<() => void> }) {
  const map = useMap();
  useEffect(() => {
    onZoomIn.current = () => map.zoomIn();
    onZoomOut.current = () => map.zoomOut();
  }, [map, onZoomIn, onZoomOut]);
  return null;
}

function MapFlyTo({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 14, { duration: 1.5 });
    }
  }, [position, map]);
  return null;
}

export function RouteMap() {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { data: orders, loading: ordersLoading } = useFirestoreCollection<any>('orders');
  const { data: drivers, loading: driversLoading } = useFirestoreCollection<any>('drivers');
  const [polylines, setPolylines] = useState<Record<string, [number, number][]>>({});
  const [selectedPosition, setSelectedPosition] = useState<[number, number] | null>(null);

  const [livePositions, setLivePositions] = useState<Record<string, { lat: number; lng: number; pathIndex: number }>>({});

  const zoomInRef = React.useRef<() => void>(() => {});
  const zoomOutRef = React.useRef<() => void>(() => {});

  const fetchDirections = async (points: {lat: number, lng: number}[], driverId: string) => {
    try {
      const res = await fetch('/api/routes/directions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points })
      });
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const data = await res.json();
      if (data.path) {
        setPolylines(prev => ({...prev, [driverId]: data.path}));
        setLivePositions(prev => ({
          ...prev, 
          [driverId]: { lat: data.path[0][0], lng: data.path[0][1], pathIndex: 0 }
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // Generate real paths for assigned orders
    if (!orders || orders.length === 0) return;
    
    // Group orders by driver
    const grouped: Record<string, typeof orders> = {};
    orders.forEach(o => {
      if (o.driver) {
        if (!grouped[o.driver]) grouped[o.driver] = [];
        grouped[o.driver].push(o);
      }
    });

    Object.entries(grouped).forEach(([driverId, drvOrders]) => {
      if (drvOrders.length >= 2) {
        const points = drvOrders.map(o => ({ lat: o.lat, lng: o.lng }));
        fetchDirections(points, driverId);
      } else {
        // Clear if not enough points
        setPolylines(p => { const newP = {...p}; delete newP[driverId]; return newP; });
        setLivePositions(prev => { const newP = {...prev}; delete newP[driverId]; return newP; });
      }
    });
  }, [orders]);

  // Simulate vehicle movement
  useEffect(() => {
    const intervalId = setInterval(() => {
      setLivePositions(prev => {
        const nextPositions = { ...prev };
        for (const [driverId, path] of Object.entries(polylines as Record<string, [number, number][]>)) {
          if (path && path.length > 0) {
            const state = prev[driverId] || { pathIndex: 0 };
            
            // Move forward by a set number of points (adjust based on path density)
            // Directions API returns a very dense path, so jumping by 1 point with CSS transition makes it smooth
            let nextIndex = state.pathIndex + 1;
            
            if (nextIndex >= path.length) {
              // Once they hit the end of the route, stay there or reset
              nextIndex = 0; 
            }
            const pos = path[nextIndex];
            nextPositions[driverId] = { lat: pos[0], lng: pos[1], pathIndex: nextIndex };
          }
        }
        return nextPositions;
      });
    }, 1000); // every 1s

    return () => clearInterval(intervalId);
  }, [polylines]);

  const handleOptimize = async () => {
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
  if (ordersLoading || driversLoading) {
    return <div className="flex-1 p-8 text-slate-400">Loading map data...</div>;
  }

  const unassignedCount = orders.filter(o => !o.driver).length;

  // Colors for different drivers to distinguish polylines
  const driverColors: Record<string, string> = {
    'DRV-01': '#3b82f6',
    'DRV-02': '#eab308',
    'DRV-03': '#a855f7',
    'DRV-04': '#ec4899',
    'DRV-05': '#22c55e',
  };

  return (
    <div className="flex flex-col md:flex-row h-full w-full relative z-10">
      <div className="w-full md:w-[340px] max-h-[45vh] md:max-h-none bg-white/5 backdrop-blur-2xl border-r border-white/10 flex flex-col z-[400] relative shadow-2xl">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold tracking-tight text-lg text-white">Route Planner</h2>
            <button 
               onClick={() => {
                 const newRadius = window.prompt("Set search radius for optimization (km)", "50");
                 if (newRadius) alert("Radius updated to " + newRadius + "km!");
               }}
               className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors border border-white/10"
            >
              <Settings2 size={16} />
            </button>
          </div>

          <button 
            onClick={handleOptimize}
            disabled={isOptimizing}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/30 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isOptimizing ? (
              <><span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Optimizing...</>
            ) : (
              <><Play size={16} fill="currentColor" /> Preview assignments</>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-3 bg-white/5 border-b border-white/10 flex justify-between items-center backdrop-blur-md sticky top-0 z-10">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unassigned</span>
            <span className="bg-rose-500/20 text-rose-400 font-medium px-2 py-0.5 rounded text-[10px] border border-rose-500/30">{unassignedCount}</span>
          </div>
          
          <div className="flex flex-col gap-2 p-4">
            {orders.filter(o => !o.driver).map(order => (
              <div 
                key={order.id} 
                onClick={() => setSelectedPosition([order.lat, order.lng])}
                className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-xl border border-white/5 cursor-pointer border-l-2 border-l-rose-500"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-medium text-white">{order.client}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-rose-500/20 text-rose-400 rounded">{order.timeWindow}</span>
                </div>
                <div className="text-xs text-slate-400 truncate mb-3">{order.address}</div>
                <div className="flex gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-md text-[10px] font-medium text-slate-300 border border-white/5">
                    <Package size={10} className="text-slate-400" /> Vol: {order.volume}
                  </span>
                </div>
              </div>
            ))}
            {orders.filter(o => !o.driver).length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">No unassigned sample orders. Use Preview assignments to inspect delayed work.</div>
            )}
          </div>

          <div className="px-6 py-3 bg-white/5 border-y border-white/10 flex justify-between items-center backdrop-blur-md sticky top-0 z-10">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assigned</span>
            <span className="bg-blue-500/20 text-blue-400 font-medium px-2 py-0.5 rounded text-[10px] border border-blue-500/30">{orders.filter(o => o.driver).length}</span>
          </div>

          <div className="flex flex-col gap-2 p-4">
             {orders.filter(o => o.driver).map(order => (
              <div 
                key={order.id} 
                onClick={() => setSelectedPosition([order.lat, order.lng])}
                className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-xl border border-white/5 cursor-pointer border-l-2 border-l-blue-500"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-medium text-white">{order.client}</span>
                  <span className="text-[10px] text-slate-500">{order.timeWindow}</span>
                </div>
                <div className="text-xs text-slate-400 truncate mb-3">{order.address}</div>
                <div className="flex gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 rounded-md text-[10px] font-medium text-blue-400 border border-blue-500/20">
                    <Truck size={10} /> {order.driver}
                  </span>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
      <div className="flex-1 relative z-0 bg-slate-900">
        <MapContainer center={[51.52, -0.1]} zoom={12} style={{ height: '100%', width: '100%', background: '#0f172a' }} zoomControl={false}>
          {/* Use a dark tile layer for better contrast in frosted glass theme */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <MapControls onZoomIn={zoomInRef} onZoomOut={zoomOutRef} />
          <MapFlyTo position={selectedPosition} />
          {orders.map(order => (
            <Marker 
              key={order.id} 
              position={[order.lat, order.lng]}
              icon={order.driver ? customIcon : unassignedIcon}
            >
              <Popup className="dark-popup">
                <div className="font-bold text-slate-800">{order.client}</div>
                <div className="text-xs text-slate-600">{order.address}</div>
                <div className="text-xs mt-1 text-slate-500">Time: {order.timeWindow}</div>
                <div className="text-xs font-medium mt-1">Driver: {order.driver || 'Unassigned'}</div>
              </Popup>
            </Marker>
          ))}
          {Object.entries(polylines).map(([driverId, pathCoords]) => (
            <Polyline 
              key={driverId}
              positions={pathCoords}
              pathOptions={{ 
                color: driverColors[driverId] || '#3b82f6', 
                weight: 4, 
                opacity: 0.8 
              }} 
            />
          ))}
          {Object.entries(livePositions).map(([driverId, pos]: [string, any]) => {
            const color = driverColors[driverId] || '#3b82f6';
            const vehicleIcon = new L.DivIcon({
              html: `<div style="width: 16px; height: 16px; background-color: ${color}; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${color}"></div>`,
              className: 'vehicle-marker',
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            });
            const driver = drivers.find((d: any) => d.id === driverId);
            const driverOrders = orders.filter(o => o.driver === driverId && o.status !== 'delivered');
            const nextStop = driverOrders.length > 0 ? driverOrders[0] : null;
            
            // Mock ETA relative to current time for realism
            const etaTime = new Date(Date.now() + 1000 * 60 * 25).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

            return (
              <Marker
                key={`vehicle-${driverId}`}
                position={[pos.lat, pos.lng]}
                icon={vehicleIcon}
              >
                <Popup className="dark-popup">
                  <div className="font-bold text-white mb-2 pb-2 border-b border-white/10 break-words">{driver?.name || driverId}</div>
                  <div className="space-y-1.5">
                     <div className="flex justify-between items-center gap-4">
                       <span className="text-xs text-slate-500">Status</span>
                       <span className="text-xs text-emerald-400 font-medium">En Route</span>
                     </div>
                     <div className="flex justify-between items-start gap-4">
                       <span className="text-xs text-slate-500 whitespace-nowrap">Next Stop</span>
                       <span className="text-xs text-slate-200 text-right truncate max-w-[120px]" title={nextStop?.address || 'Returning to Depot'}>
                         {nextStop ? nextStop.address : 'Depot'}
                       </span>
                     </div>
                     <div className="flex justify-between items-center gap-4">
                       <span className="text-xs text-slate-500">ETA</span>
                       <span className="text-xs text-slate-200 font-mono">{nextStop ? etaTime : '--:--'}</span>
                     </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
        
        {/* Floating Controls similar to design */}
        <div className="absolute bottom-8 right-8 z-[500] flex flex-col gap-4 pointer-events-none">
          <div className="bg-white/10 backdrop-blur-2xl border border-white/20 p-2 rounded-full flex gap-1 self-end pointer-events-auto transform shadow-2xl">
            <button onClick={() => zoomInRef.current?.()} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            </button>
            <button onClick={() => zoomOutRef.current?.()} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
