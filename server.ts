import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import polyline from '@mapbox/polyline';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- VRP ENGINE HELPERS ---
// Haversine distance
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p = 0.017453292519943295;
  const c = Math.cos;
  const a = 0.5 - c((lat2 - lat1) * p)/2 +
          c(lat1 * p) * c(lat2 * p) *
          (1 - c((lon2 - lon1) * p))/2;
  return 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
}

// 1. API: VRP Optimization
app.post('/api/vrp/optimize', async (req, res) => {
  const { drivers, orders } = req.body;
  if (!drivers || !orders) {
    return res.status(400).json({ error: 'Drivers and orders are required' });
  }

  // Very simple Greedy VRP Algorithm
  // Assign unassigned orders to active/idle drivers taking capacity into account.
  const unassignedOrders = orders.filter((o: any) => !o.driver);
  let availableDrivers = drivers.filter((d: any) => d.status === 'active' || d.status === 'idle');

  // Simple depot coordinates (center of London for mock data)
  const DEPOT_LAT = 51.505;
  const DEPOT_LNG = -0.09;

  let assignedUpdates = [];

  for (let order of unassignedOrders) {
    let bestDriver = null;
    let minDistance = Infinity;

    for (let driver of availableDrivers) {
      if (driver.capacity >= order.volume) {
        // Calculate distance from depot to order (simplified)
        let dist = getDistance(DEPOT_LAT, DEPOT_LNG, order.lat, order.lng);
        if (dist < minDistance) {
          minDistance = dist;
          bestDriver = driver;
        }
      }
    }

    if (bestDriver) {
      // Assign it
      bestDriver.capacity -= order.volume;
      assignedUpdates.push({
        orderId: order.id,
        driverId: bestDriver.id,
        status: 'in-transit'
      });
    }
  }

  // Also we can fetch real route geometry for a given driver's points if needed
  return res.json({ assignedUpdates });
});

// 2. API: Map Directions (OSRM)
app.post('/api/routes/directions', async (req, res) => {
  const { points } = req.body || {};
  // points: [{lat, lng}, {lat, lng}]
  if (!Array.isArray(points) || points.length < 2 || points.length > 50 || points.some((p: any) => !p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) {
    return res.json({ geometry: null });
  }

  try {
    const coordsStr = points.map((p: any) => `${p.lng},${p.lat}`).join(';');
    // Fallback to openstreetmap.de since project-osrm.org often returns 502
    const osrmUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordsStr}?overview=full`;

    const response = await fetch(osrmUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'OptiRoute-VR-App/1.0'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`[Routing Fallback] OSRM API returned ${response.status}. Using direct lines.`);
      // Fallback: just return a path of direct points
      const fallbackPath = points.map((p: any) => [p.lat, p.lng]);
      return res.json({ path: fallbackPath, kind: "direct", distanceMeters: null, durationSeconds: null });
    }

    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      // Decode polyline into [lat, lng] array for Leaflet
      const encodedPolyline = data.routes[0].geometry;
      const decodedCoords = polyline.decode(encodedPolyline);
      return res.json({ path: decodedCoords, kind: "road", distanceMeters: data.routes[0].distance, durationSeconds: data.routes[0].duration });
    }
    const fallbackPath = points.map((p: any) => [p.lat, p.lng]);
    return res.json({ path: fallbackPath, kind: "direct", distanceMeters: null, durationSeconds: null });
  } catch (error) {
    console.warn('[Routing Fallback] Failed to fetch route, using direct lines.', error instanceof Error ? error.message : '');
    // Fallback on error
    const fallbackPath = points.map((p: any) => [p.lat, p.lng]);
    return res.json({ path: fallbackPath, kind: "direct", distanceMeters: null, durationSeconds: null });
  }
});

// 3. API: Webhook Integration (External System Hook)
// Mocks a webhook that external systems could hit
let pendingWebhooks: any[] = [];
app.post('/api/webhooks/orders', (req, res) => {
  const newOrder = req.body;
  pendingWebhooks.push({
    ...newOrder,
    receivedAt: new Date().toISOString()
  });
  return res.status(201).json({ status: 'Order received via webhook' });
});

app.get('/api/webhooks/pending', (req, res) => {
  // Frontend can poll this to ingest created orders
  const current = [...pendingWebhooks];
  pendingWebhooks = [];
  return res.json({ pending: current });
});

async function startServer() {
  // AI Studio launches the development command with --host. Use Vite there,
  // otherwise an old dist folder masks saved frontend changes indefinitely.
  const isDevLaunch = process.argv.includes('--host') && process.env.NODE_ENV !== 'production';
  const isProd = process.env.NODE_ENV === "production" || (!process.env.VITE_DEV_SERVER && !isDevLaunch);
  const distPath = path.join(process.cwd(), 'dist');
  const fs = await import('fs');
  let distExists = fs.existsSync(distPath);

  // If in prod and dist is missing, try to build it dynamically
  if (isProd && !distExists) {
    console.log('Dist does not exist in production! Running vite build dynamically...');
    try {
      const { execSync } = await import('child_process');
      execSync('npx vite build', { stdio: 'inherit' });
      distExists = fs.existsSync(distPath);
    } catch (e) {
      console.error('Dynamic build failed', e);
    }
  }

  // Vite middleware for development (or failed prod build fallback)
  if (!isProd || !distExists) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Basic static serving setup for production
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (Prod mode: ${distExists})`);
  });
}

startServer();
