import { Map, Users, ListFilter, Activity, Route, ArrowUpRight } from 'lucide-react';
interface SidebarProps {activeTab:'dashboard'|'map'|'drivers'|'orders';setActiveTab:(tab:'dashboard'|'map'|'drivers'|'orders')=>void;}
export function Sidebar({activeTab,setActiveTab}:SidebarProps) {
  const items=[{id:'dashboard',icon:Activity,label:'Overview'},{id:'map',icon:Map,label:'Planner'},{id:'drivers',icon:Users,label:'Drivers'},{id:'orders',icon:ListFilter,label:'Orders'}] as const;
  return <aside className="opti-sidebar">
    <div className="opti-brand"><span className="opti-brand-icon"><Route size={22}/></span><div>OptiRoute<small>FLEET WORKSPACE</small></div></div>
    <span className="opti-nav-caption">OPERATIONS</span>
    <nav aria-label="Main navigation">{items.map(item=><button key={item.id} aria-label={item.label} aria-current={activeTab===item.id?'page':undefined} className={activeTab===item.id?'selected':''} onClick={()=>setActiveTab(item.id)}><item.icon size={19}/><span>{item.label}</span>{activeTab===item.id&&<span className="opti-nav-dot"/>}</button>)}</nav>
    <div className="opti-sidebar-footer"><div className="opti-demo-card"><span className="opti-demo-dot"/> Interactive demo<p>Explore sample fleet data.<br/>No live vehicle dispatch.</p></div><a href="https://github.com/deepshekhardas/optiroute" target="_blank" rel="noreferrer">Engineering & source<ArrowUpRight size={14}/></a></div>
  </aside>;
}

// Navigation labels remain available to assistive technology at compact widths.
