import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Clock, Search, X, Edit, Trash, Calendar, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { useFirestoreCollection } from '../lib/useFirestore';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

export function OrderList() {
  const { data: orders, loading } = useFirestoreCollection<any>('orders');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
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
    if (!orders || orders.length === 0) {
      showToast('No data to export.');
      return;
    }

    // Create CSV header
    const headers = ['Order ID', 'Client', 'Address', 'Time Window', 'Status', 'Driver', 'Volume (Cubes)'];

    // Create rows
    const csvRows = orders.map((order: any) => [
      order.id || '',
      `"${order.client || ''}"`,
      `"${order.address || ''}"`,
      order.timeWindow || '',
      order.status || '',
      order.driver || 'Unassigned',
      order.volume || ''
    ]);

    // Combine to single string
    const csvContent = [headers.join(','), ...csvRows.map((row: any) => row.join(','))].join('\n');

    // Blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `optiroute-orders-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Orders exported to CSV!');
  };

  const handleDelete = async (id: string) => {
    setActionMenuId(null);
    if (!window.confirm('Are you sure you want to delete this order?')) return;
    try {
      await deleteDoc(doc(db, 'orders', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'orders');
    }
  };

  const handleEdit = (order: any) => {
    setEditingOrder(order);
    setIsModalOpen(true);
    setActionMenuId(null);
  };

  const handleAddSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const fd = new FormData(e.currentTarget);
    const newId = editingOrder ? editingOrder.id : `ORD-${Math.floor(Math.random() * 9000) + 1000}`;

    // Slight randomness around London depot for mock
    const lat = editingOrder ? editingOrder.lat : 51.505 + (Math.random() - 0.5) * 0.1;
    const lng = editingOrder ? editingOrder.lng : -0.09 + (Math.random() - 0.5) * 0.1;

    try {
      await setDoc(doc(db, 'orders', newId), {
        userId: user.uid,
        client: fd.get('client'),
        address: fd.get('address'),
        timeWindow: fd.get('timeWindow'),
        status: editingOrder ? editingOrder.status : 'pending',
        driver: editingOrder ? editingOrder.driver : null,
        volume: Number(fd.get('volume')),
        lat: lat,
        lng: lng
      });
      setIsModalOpen(false);
      setEditingOrder(null);
      showToast(editingOrder ? 'Order updated successfully!' : 'Order created successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
      showToast('Error saving order.');
    }
  };

  const filteredOrders = orders
            .filter((order: any) => {
               if (activeTab === 'active') {
                 if (order.status === 'delivered') return false;
               } else {
                 if (order.status !== 'delivered') return false;
                 // Dummy Date filtering since real 'date' field doesn't exist, we assume they passed if no date found or we check `createdAt` if available
                 if (dateRange.start || dateRange.end) {
                   // Mock filtering: in reality we would parse `order.date` or `order.createdAt`
                   // Since we don't have it, we just pass to show UI works, or we can mock it
                   // If order has a date use it, else let it pass or fail
                   const rawDate = order.deliveredAt || order.updatedAt || order.createdAt;
                   const parsedDate = rawDate?.toDate ? rawDate.toDate() : rawDate ? new Date(rawDate) : null;
                   const orderDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString().split('T')[0] : '';
                   if (!orderDate) return false;
                   if (dateRange.start && orderDate < dateRange.start) return false;
                   if (dateRange.end && orderDate > dateRange.end) return false;
                 }
               }

               const matchesSearch =
                 order.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 order.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 order.address?.toLowerCase().includes(searchTerm.toLowerCase());

               return matchesSearch;
            });

  if (loading) {
    return <div className="flex-1 p-8 text-slate-500">Loading orders...</div>;
  }

  return (
    <div className="records-page flex-1 overflow-auto p-6 sm:p-8 w-full z-10 relative">
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-[9999] bg-emerald-500 text-white px-6 py-3 rounded-xl shadow-lg font-medium animate-in slide-in-from-bottom-5">
          {toastMessage}
        </div>
      )}

      <div className="records-heading flex justify-between items-end mb-6 pb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2">Order Management</h1>
          <p className="text-slate-500 text-sm">View and manage all deliveries and exceptions.</p>
        </div>
        <div className="flex gap-3 relative z-20">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-900 px-5 py-2.5 font-bold text-sm rounded-xl transition-all shadow-sm"
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            onClick={() => {
              setEditingOrder(null);
              setIsModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 font-bold text-sm rounded-xl shadow-sm hover:shadow-sm transition-all "
          >
            New Order
          </button>
        </div>
      </div>

      <div className="flex gap-6 mb-8 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('active')}
          className={cn("pb-4 text-sm font-bold transition-all relative", activeTab === 'active' ? "text-blue-600" : "text-slate-500 hover:text-slate-900")}
        >
          Active Orders
          {activeTab === 'active' && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-500 shadow-sm"></div>}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn("pb-4 text-sm font-bold transition-all relative", activeTab === 'history' ? "text-blue-600" : "text-slate-500 hover:text-slate-900")}
        >
          Historical (Delivered)
          {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-500 shadow-sm"></div>}
        </button>
      </div>

      {activeTab === 'history' && <p className="text-xs text-slate-500 mb-4">Date filters use stored delivery/update/creation dates. Undated sample records are excluded when a date filter is applied.</p>}
      <div className="mb-6 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-0 max-w-md group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 group-focus-within:text-blue-600 transition-colors" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search orders" placeholder="Search orders by client, ID, or address..."
              className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
            />
          </div>
          {activeTab === 'history' && (
            <div className="flex items-center gap-3 bg-white p-1.5 rounded-xl border border-slate-200 shadow-inner">
               <div className="px-3 flex items-center gap-2 text-slate-500 text-sm">
                 <Calendar size={14} /> Dates
               </div>
               <input
                 type="date" aria-label="History start date"
                 className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                 value={dateRange.start}
                 onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
               />
               <span className="text-slate-500">-</span>
               <input
                 type="date" aria-label="History end date"
                 className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                 value={dateRange.end}
                 onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
               />
               {(dateRange.start || dateRange.end) && (
                 <button onClick={() => setDateRange({start: '', end: ''})} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors">
                   <X size={14} />
                 </button>
               )}
            </div>
          )}
      </div>

      <div className="bg-white  border border-slate-200 rounded-xl overflow-x-auto shadow-sm relative z-10 record-table">
        <div className="record-grid grid grid-cols-7 p-4 border-b border-slate-200 bg-white text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          <div className="col-span-2 pl-2">Client / Order ID</div>
          <div className="col-span-2">Address</div>
          <div>Time Window</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredOrders.map((order: any) => (
            <div key={order.id} className="record-grid grid grid-cols-7 p-4 items-center hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
              <div className="col-span-2 pl-2">
                <div className="font-bold text-slate-900 text-sm">{order.client}</div>
                <div className="text-xs text-slate-500 mt-0.5">{order.id}</div>
              </div>
              <div className="col-span-2 text-sm text-slate-600 pr-4 truncate">
                {order.address}
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-1.5 font-mono">
                {order.timeWindow}
              </div>
              <div>
                <span className={cn(
                  "inline-flex text-[10px] font-medium px-2 py-0.5 rounded border",
                  order.status === 'delivered' && "bg-emerald-500/20 text-emerald-700 border-emerald-500/30",
                  order.status === 'pending' && "bg-orange-500/20 text-orange-700 border-orange-500/30",
                  order.status === 'delayed' && "bg-rose-500/20 text-rose-700 border-rose-500/30",
                  order.status === 'in-transit' && "bg-blue-500/20 text-blue-600 border-blue-500/30",
                )}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
                {order.driver && <div className="text-[10px] text-slate-500 mt-1 ml-1 font-mono">{order.driver}</div>}
              </div>
              <div className="text-right relative">
                <button
                  aria-label={`Actions for ${order.client}`} onClick={() => setActionMenuId(actionMenuId === order.id ? null : order.id)}
                  className="p-2 text-slate-500 hover:text-slate-900 transition-opacity hover:bg-slate-100 rounded-lg"
                >
                   <MoreHorizontal size={18} />
                </button>
                {actionMenuId === order.id && (
                  <div ref={menuRef} className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden">
                    <button onClick={() => handleEdit(order)} className="w-full text-left px-4 py-2 text-xs text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-2">
                      <Edit size={12} /> Edit Order
                    </button>
                    <button onClick={() => handleDelete(order.id)} className="w-full text-left px-4 py-2 text-xs text-rose-700 hover:bg-slate-100 transition-colors flex items-center gap-2">
                      <Trash size={12} /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {filteredOrders.length === 0 && <div role="status" className="records-empty"><strong>No matching orders</strong><p>Try a different search or date range.</p></div>}
      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div role="dialog" aria-modal="true" aria-label="Order details" className="record-modal bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-sm relative overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">{editingOrder ? 'Edit Order' : 'Create New Order'}</h2>
              <button aria-label="Close form" onClick={() => { setIsModalOpen(false); setEditingOrder(null); }} className="text-slate-500 hover:text-slate-900 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-6 flex flex-col gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Client Name</label>
                <input required defaultValue={editingOrder?.client || ''} aria-label="Client name" name="client" type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all" placeholder="e.g. Acme Corp" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Delivery Address</label>
                <input required defaultValue={editingOrder?.address || ''} aria-label="Delivery address" name="address" type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all" placeholder="e.g. 123 Main St" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Time Window</label>
                  <input required defaultValue={editingOrder?.timeWindow || ''} aria-label="Time window" name="timeWindow" type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all" placeholder="e.g. 10:00 - 12:00" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Volume (Cubes)</label>
                  <input required defaultValue={editingOrder?.volume || ''} aria-label="Volume" name="volume" type="number" min="1" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all" placeholder="e.g. 40" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button type="button" onClick={() => { setIsModalOpen(false); setEditingOrder(null); }} className="px-5 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-900 hover:bg-white rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 font-bold text-sm rounded-xl shadow-sm transition-all">{editingOrder ? 'Save Changes' : 'Save Order'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
