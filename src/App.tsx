import { useState } from 'react';
import { RouteMap } from './components/RouteMap';
import { DashboardHome } from './components/DashboardHome';
import { DriverList } from './components/DriverList';
import { OrderList } from './components/OrderList';
import { ArrowUpRight, MapPin, Map, Users, ListFilter, Activity, Route } from 'lucide-react';

interface SidebarProps {activeTab:'dashboard'|'map'|'drivers'|'orders';setActiveTab:(tab:'dashboard'|'map'|'drivers'|'orders')=>void;}
function WorkspaceNavigation({activeTab,setActiveTab}:SidebarProps) {
  const items=[{id:'dashboard',icon:Activity,label:'Overview'},{id:'map',icon:Map,label:'Planner'},{id:'drivers',icon:Users,label:'Drivers'},{id:'orders',icon:ListFilter,label:'Orders'}] as const;
  return <aside className="opti-sidebar">
    <div className="opti-brand"><span className="opti-brand-icon"><Route size={22}/></span><div>OptiRoute<small>FLEET WORKSPACE</small></div></div>
    <span className="opti-nav-caption">OPERATIONS</span>
    <nav aria-label="Main navigation">{items.map(item=><button key={item.id} aria-label={item.label} aria-current={activeTab===item.id?'page':undefined} className={activeTab===item.id?'selected':''} onClick={()=>setActiveTab(item.id)}><item.icon size={19}/><span>{item.label}</span>{activeTab===item.id&&<span className="opti-nav-dot"/>}</button>)}</nav>
    <div className="opti-sidebar-footer"><div className="opti-demo-card"><span className="opti-demo-dot"/> Interactive demo<p>Explore sample fleet data.<br/>No live vehicle dispatch.</p></div><a href="https://github.com/deepshekhardas/optiroute" target="_blank" rel="noreferrer">Engineering & source<ArrowUpRight size={14}/></a></div>
  </aside>;
}

// Navigation labels remain available to assistive technology at compact widths.

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'map' | 'drivers' | 'orders'>('map');
  const titles = {dashboard:'Fleet overview',map:'Delivery planner',drivers:'Driver workspace',orders:'Order management'};
  return <div className="opti-app">
    <WorkspaceNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
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
