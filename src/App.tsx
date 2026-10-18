import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { RouteMap } from './components/RouteMap';
import { DashboardHome } from './components/DashboardHome';
import { DriverList } from './components/DriverList';
import { OrderList } from './components/OrderList';
import { ArrowUpRight, MapPin } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'map' | 'drivers' | 'orders'>('map');
  const titles = {dashboard:'Fleet overview',map:'Delivery planner',drivers:'Driver workspace',orders:'Order management'};
  return <div className="opti-app">
    <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
    <main className="opti-main">
      <header className="opti-header">
        <div><div className="opti-breadcrumb">Workspace <span>/</span> {titles[activeTab]}</div><h1>{titles[activeTab]}</h1></div>
        <div className="opti-header-actions"><span className="opti-territory"><MapPin size={14}/> London Central</span><span className="opti-sample">Sample workspace</span><button className="opti-header-link" onClick={()=>setActiveTab(activeTab==='orders'?'map':'orders')}>{activeTab==='orders'?'Open planner':'View orders'}<ArrowUpRight size={15}/></button></div>
      </header>
      <div className={`opti-content ${activeTab==='map'?'opti-content-map':'opti-content-records'}`}>
        {activeTab==='dashboard' && <DashboardHome/>}{activeTab==='map' && <RouteMap/>}{activeTab==='drivers' && <DriverList/>}{activeTab==='orders' && <OrderList/>}
      </div>
    </main>
  </div>;
}
