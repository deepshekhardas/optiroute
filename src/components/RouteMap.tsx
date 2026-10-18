import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Play, Package, Truck, Search, RefreshCw, ChevronRight, MapPin } from 'lucide-react';
import { useFirestoreCollection } from '../lib/useFirestore';

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

function RouteFocus({path}:{path:[number,number][]|undefined}) {
  const map=useMap();
  useEffect(()=>{if(path?.length)map.fitBounds(L.latLngBounds(path),{padding:[55,75],maxZoom:15});},[map,path]);
  useEffect(()=>{const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(map.getContainer());return()=>observer.disconnect();},[map]);
  return null;
}

export function RouteMap() {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [panelTab,setPanelTab]=useState<'routes'|'stops'>('routes');
  const [stopQuery,setStopQuery]=useState('');
  const [selectedRoute,setSelectedRoute]=useState<string|null>(null);
  const [previewRows, setPreviewRows] = useState<string[] | null>(null);
  const [tileFailed, setTileFailed] = useState(false);
  const [routeFailed, setRouteFailed] = useState(false);
  const { data: orders, loading: ordersLoading } = useFirestoreCollection<any>('orders');
  const { data: drivers, loading: driversLoading } = useFirestoreCollection<any>('drivers');
  const [polylines, setPolylines] = useState<Record<string, [number, number][]>>({});
  const [selectedPosition, setSelectedPosition] = useState<[number, number] | null>(null);

  const [livePositions, setLivePositions] = useState<Record<string, { lat: number; lng: number; pathIndex: number }>>({});

  const zoomInRef = React.useRef<() => void>(() => {});
  const zoomOutRef = React.useRef<() => void>(() => {});

  const [routeRevision, setRouteRevision] = useState(0);
  const [routeSummary, setRouteSummary] = useState<Record<string, {state: string; km?: number; minutes?: number}>>({});
  const routeCache = React.useRef(new Map<string, {at: number; path: [number, number][]; km: number; minutes: number}>());

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const grouped: Record<string, any[]> = {};
    orders.filter(o => o.driver && o.status !== 'delivered').forEach(o => {
      (grouped[o.driver] ||= []).push(o);
    });
    setPolylines({}); setLivePositions({}); setRouteFailed(false);
    setRouteSummary(Object.fromEntries(Object.keys(grouped).map(id => [id, {state: 'loading'}])));
    async function load() {
      for (const [driverId, stops] of Object.entries(grouped)) {
        if (!current) return;
        // A fixed, labelled sample depot makes single-stop routes meaningful too.
        const points = [{lat: 51.505, lng: -0.09}, ...stops.map(o => ({lat:o.lat,lng:o.lng}))];
        try {
          if (points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat)>90 || Math.abs(p.lng)>180) || points.length>50) throw Error('Invalid route coordinates');
          const key = JSON.stringify(points);
          let result = routeCache.current.get(key);
          if (!result || Date.now()-result.at>300000) {
            result = undefined;
            // Shared static previews may not expose the Node API. Try it first,
            // then fetch GeoJSON from the public routing service for this demo.
            try {
              const response = await fetch('/api/routes/directions', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({points}), signal:AbortSignal.any([controller.signal,AbortSignal.timeout(9000)])});
              if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
                const data = await response.json();
                if (data.kind==='road' && Array.isArray(data.path) && data.path.length>1 && Number.isFinite(data.distanceMeters) && Number.isFinite(data.durationSeconds)) result={at:Date.now(),path:data.path,km:data.distanceMeters/1000,minutes:data.durationSeconds/60};
              }
            } catch { /* Public demo provider below; cancellation is checked first. */ }
            if (!current) return;
            if (!result) {
              const coordinates=points.map(p=>`${p.lng},${p.lat}`).join(';');
              for (const provider of ['https://routing.openstreetmap.de/routed-car/route/v1/driving/','https://router.project-osrm.org/route/v1/driving/']) {
                if (!current) return;
                try {
                  const response=await fetch(`${provider}${coordinates}?overview=full&geometries=geojson&steps=false`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(9000)])});
                  if (!response.ok) continue;
                  const data=await response.json(), route=data.routes?.[0];
                  if (data.code!=='Ok' || !Array.isArray(route?.geometry?.coordinates) || route.geometry.coordinates.length<2 || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) continue;
                  const path=route.geometry.coordinates.map((p:number[])=>[p[1],p[0]] as [number,number]);
                  if (path.some((p:[number,number])=>!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>90||Math.abs(p[1])>180)) continue;
                  result={at:Date.now(),path,km:route.distance/1000,minutes:route.duration/60}; break;
                } catch { /* Bounded fallback, never fabricated road geometry. */ }
              }
            }
            if (!result) throw Error('Road directions unavailable');
            if (routeCache.current.size>=30) routeCache.current.clear();
            routeCache.current.set(key,result);
          }
          if (!current) return;
          const resolved=result;
          setPolylines(prev=>({...prev,[driverId]:resolved.path}));
          setRouteSummary(prev=>({...prev,[driverId]:{state:'ready',km:resolved.km,minutes:resolved.minutes}}));
          setLivePositions(prev=>({...prev,[driverId]:{lat:resolved.path[0][0],lng:resolved.path[0][1],pathIndex:0}}));
        } catch {
          if (!current) return;
          setRouteFailed(true);
          setRouteSummary(prev=>({...prev,[driverId]:{state:'failed'}}));
        }
      }
    }
    void load();
    return ()=>{current=false;controller.abort();};
  }, [orders, routeRevision]);

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
      setPreviewRows(rows.length ? rows : ['No unassigned or delayed sample orders need reassignment.']);
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
    'DRV-06': '#0d9488',
  };

  return (
    <div className="planner-layout">
      <section className="planner-panel" aria-label="Delivery planning">
        <div className="planner-heading"><span className="planner-eyebrow"><span/> LONDON CENTRAL / SAMPLE DATA</span><h2>Plan the next mile.</h2><p>Your routes, stops and capacity in one clear view.</p>
          <div className="planner-stats"><div><strong>{orders.filter(o=>o.status!=='delivered').length}</strong><span>Active stops</span></div><div><strong>{Object.keys(routeSummary).length}</strong><span>Road routes</span></div><div><strong>{unassignedCount}</strong><span>Unassigned</span></div></div>
          <button className="planner-primary" onClick={handleOptimize} disabled={isOptimizing}><Play size={15}/>{isOptimizing?'Calculating...':'Preview assignments'}<ChevronRight size={16}/></button>
        </div>
        {previewRows && <section aria-label="Assignment preview" aria-live="polite" className="planner-preview"><strong>Assignment preview</strong><p>Capacity-based proposal. No dispatch or saved changes.</p><ul>{previewRows.map((row,index)=><li key={index}>{row}</li>)}</ul><button onClick={()=>setPreviewRows(null)}>Close preview</button></section>}
        <div className="planner-tabs" role="tablist" aria-label="Planner views"><button role="tab" aria-selected={panelTab==='routes'} onClick={()=>setPanelTab('routes')}>Routes <span>{Object.keys(routeSummary).length}</span></button><button role="tab" aria-selected={panelTab==='stops'} onClick={()=>setPanelTab('stops')}>Stops <span>{orders.length}</span></button></div>
        <div className="planner-scroll">
          {panelTab==='routes'?<section aria-label="Road routes" aria-live="polite">
            <div className="planner-section-heading"><span>DRIVER ROUTES</span><button onClick={()=>{routeCache.current.clear();setRouteRevision(v=>v+1);}} aria-label="Retry routes"><RefreshCw size={13}/> Refresh</button></div>
            {(Object.entries(routeSummary) as [string,{state:string;km?:number;minutes?:number}][]).map(([id,route])=>{
              const driver=drivers.find(d=>d.id===id);const count=orders.filter(o=>o.driver===id&&o.status!=='delivered').length;
              return <button key={id} className={`planner-route-card ${selectedRoute===id?'is-selected':''}`} onClick={()=>setSelectedRoute(id)} disabled={route.state!=='ready'} aria-label={`View ${id} road route`}>
                <div className="planner-route-title"><span className="planner-route-symbol" style={{color:driverColors[id]||'#2563eb',background:(driverColors[id]||'#2563eb')+'14'}}><Truck size={17}/></span><div><strong>{driver?.name||id}</strong><small>{id} / {count} {count===1?'stop':'stops'}</small></div><ChevronRight size={15}/></div>
                <div className="planner-route-metrics">{route.state==='ready'?<><span>{route.km===0?'At sample depot':`${route.km?.toFixed(1)} km`}<small>Driving distance</small></span><span>{Math.ceil(route.minutes||0)} min<small>Estimated drive</small></span></>:<span className="planner-route-status">{route.state==='loading'?'Loading road geometry...':'Unavailable - use Refresh'}</span>}</div>
              </button>;
            })}
            {Object.keys(routeSummary).length===0&&<div className="planner-empty"><Truck size={24}/><strong>No active routes</strong><p>Assigned sample stops will appear here.</p></div>}
            <p className="planner-footnote">Routes start at the sample London depot. Drive estimates exclude live traffic. Public demo routing; use sample locations only.</p>
          </section>:<section aria-label="Order stops"><label className="planner-search"><Search size={16}/><input aria-label="Search stops" placeholder="Search client or address" value={stopQuery} onChange={e=>setStopQuery(e.target.value)}/></label>
            {orders.filter(o=>`${o.client} ${o.address} ${o.id}`.toLowerCase().includes(stopQuery.toLowerCase())).map(order=><button key={order.id} className="planner-stop-card" onClick={()=>setSelectedPosition([order.lat,order.lng])}><div><span className="planner-stop-icon"><MapPin size={17}/></span><strong>{order.client}</strong><ChevronRight size={14}/></div><p>{order.address}</p><footer><span>{order.timeWindow}</span><span>{order.driver||'Unassigned'}</span></footer></button>)}
            {orders.filter(o=>`${o.client} ${o.address} ${o.id}`.toLowerCase().includes(stopQuery.toLowerCase())).length===0&&<p className="planner-empty">No matching stops.</p>}
          </section>}
        </div>
      </section>
      <div className="planner-map">
        <div className="planner-map-notice">
          Road route preview / Sample locations / Simulated vehicles
          {tileFailed && <p role="status" className="text-red-700 mt-1">Map tiles could not load. Check your connection, then reload this page. Order details remain available.</p>}
          {routeFailed && <p role="status" className="text-red-700 mt-1">Some road routes are unavailable. Use Retry routes; only verified road geometry is drawn.</p>}
        </div>
        <MapContainer center={[51.52, -0.1]} zoom={12} style={{ height: '100%', width: '100%', background: '#0f172a' }} zoomControl={false}>
          {/* Use a dark tile layer for better contrast in frosted glass theme */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            eventHandlers={{ tileerror: () => setTileFailed(true), load: () => setTileFailed(false) }}
          />
          <MapControls onZoomIn={zoomInRef} onZoomOut={zoomOutRef} />
          <RouteFocus path={selectedRoute?polylines[selectedRoute]:undefined}/>
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
                opacity: 0.8,
                lineCap: 'round'
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
                       <span className="text-xs text-emerald-400 font-medium">Simulated movement</span>
                     </div>
                     <div className="flex justify-between items-start gap-4">
                       <span className="text-xs text-slate-500 whitespace-nowrap">Next Stop</span>
                       <span className="text-xs text-slate-200 text-right truncate max-w-[120px]" title={nextStop?.address || 'Returning to Depot'}>
                         {nextStop ? nextStop.address : 'Depot'}
                       </span>
                     </div>
                     <div className="flex justify-between items-center gap-4">
                       <span className="text-xs text-slate-500">ETA (not measured)</span>
                       <span className="text-xs text-slate-200 font-mono">Not available</span>
                     </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Floating Controls similar to design */}
        <div className="planner-map-controls">
          <div className="planner-zoom">
            <button aria-label="Zoom in" onClick={() => zoomInRef.current?.()} className="planner-zoom-button">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            </button>
            <button aria-label="Zoom out" onClick={() => zoomOutRef.current?.()} className="planner-zoom-button">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
