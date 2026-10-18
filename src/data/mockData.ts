export const mockDrivers = [
  { id: 'DRV-01', name: 'James Wilson', status: 'active', vehicle: 'Van (Large)', capacity: 120, utilization: 85, currentRoute: 'RT-1042' },
  { id: 'DRV-02', name: 'Sarah Connor', status: 'delayed', vehicle: 'Box Truck', capacity: 200, utilization: 92, currentRoute: 'RT-1043' },
  { id: 'DRV-03', name: 'Michael Chang', status: 'completed', vehicle: 'Van (Medium)', capacity: 80, utilization: 100, currentRoute: 'RT-1044' },
  { id: 'DRV-04', name: 'Anna Petrova', status: 'active', vehicle: 'Van (Large)', capacity: 120, utilization: 45, currentRoute: 'RT-1045' },
  { id: 'DRV-05', name: 'David Smith', status: 'idle', vehicle: 'Box Truck', capacity: 200, utilization: 0, currentRoute: null },
  { id: 'DRV-06', name: 'Emma Johnson', status: 'active', vehicle: 'Van (Medium)', capacity: 80, utilization: 78, currentRoute: 'RT-1046' },
  { id: 'DRV-07', name: 'Robert Brown', status: 'delayed', vehicle: 'Van (Large)', capacity: 120, utilization: 88, currentRoute: 'RT-1047' },
  { id: 'DRV-08', name: 'Linda Davis', status: 'active', vehicle: 'Van (Medium)', capacity: 80, utilization: 60, currentRoute: 'RT-1048' },
];

export const mockOrders = [
  { id: 'ORD-5821', client: 'Acme Corp', address: '120 Logistics Blvd', timeWindow: '08:00 - 10:00', status: 'delivered', driver: 'DRV-03', volume: 12, lat: 51.520, lng: -0.11 },
  { id: 'ORD-5822', client: 'Techtronics', address: '45 Silicon Ave', timeWindow: '09:00 - 11:00', status: 'in-transit', driver: 'DRV-01', volume: 8, lat: 51.515, lng: -0.12 },
  { id: 'ORD-5823', client: 'Global Supply', address: '88 Harbor Rd', timeWindow: '10:00 - 12:00', status: 'delayed', driver: 'DRV-02', volume: 45, lat: 51.505, lng: -0.09 },
  { id: 'ORD-5824', client: 'Local Mart', address: '22 Main St', timeWindow: '11:00 - 13:00', status: 'pending', driver: 'DRV-04', volume: 5, lat: 51.530, lng: -0.10 },
  { id: 'ORD-5825', client: 'City Foods', address: '304 Market Sq', timeWindow: '13:00 - 15:00', status: 'pending', driver: 'DRV-04', volume: 15, lat: 51.525, lng: -0.13 },
  { id: 'ORD-5826', client: 'BuildIt Inc', address: '19 Industrial Way', timeWindow: '14:00 - 17:00', status: 'pending', driver: null, volume: 60, lat: 51.540, lng: -0.08 },
  { id: 'ORD-5827', client: 'Fresh Farms', address: '55 Country Rd', timeWindow: '15:00 - 18:00', status: 'pending', driver: 'DRV-06', volume: 22, lat: 51.490, lng: -0.11 },
  { id: 'ORD-5828', client: 'Quick Meds', address: '12 Clinic Ave', timeWindow: '16:00 - 19:00', status: 'pending', driver: null, volume: 2, lat: 51.510, lng: -0.14 },
];

export const mockRoutes = [
  { id: 'RT-1042', driverId: 'DRV-01', status: 'active', progress: 45, waypoints: 12, estCompletion: '14:30' },
  { id: 'RT-1043', driverId: 'DRV-02', status: 'delayed', progress: 30, waypoints: 8, estCompletion: '16:15' },
  { id: 'RT-1044', driverId: 'DRV-03', status: 'completed', progress: 100, waypoints: 15, estCompletion: '11:45' },
  { id: 'RT-1045', driverId: 'DRV-04', status: 'active', progress: 10, waypoints: 22, estCompletion: '17:00' },
  { id: 'RT-1046', driverId: 'DRV-06', status: 'active', progress: 65, waypoints: 10, estCompletion: '13:20' },
  { id: 'RT-1047', driverId: 'DRV-07', status: 'delayed', progress: 20, waypoints: 18, estCompletion: '18:00' },
  { id: 'RT-1048', driverId: 'DRV-08', status: 'active', progress: 80, waypoints: 14, estCompletion: '12:30' },
];
