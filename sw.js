// TRAXHAUL Service Worker — Offline-First PWA
// =============================================
// Handles:
//  - Static asset caching (app shell)
//  - Map tile caching (network-first)
//  - Background Sync (GPS log upload on reconnect)
//  - Periodic Background Sync (regular check-ins)
//  - Push notifications (driver alerts)

const CACHE_NAME  = 'traxhaul-v2.0';
const TILE_CACHE  = 'traxhaul-tiles-v1';
const DB_NAME     = 'traxhaul-db';
const GPS_STORE   = 'gps_queue';

const STATIC_ASSETS = [
  './',
  './index.html',
  './map.html',
  './stops.html',
  './cargo.html',
  './dispatcher.html',
  './owner.html',
  './settings.html',
  './css/base.css',
  './css/components.css',
  './js/app.js',
  './js/map.js',
  './js/cargo.js',
  './js/ai.js',
  './js/background.js',
  './manifest.json',
];

// ─── Install ─────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing TRAXHAUL v2.0...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== TILE_CACHE)
          .map(k  => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ───────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Google Maps tiles — network-first with tile cache
  if (url.hostname.includes('maps.googleapis.com') ||
      url.hostname.includes('maps.gstatic.com') ||
      url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(networkFirstWithCache(request, TILE_CACHE));
    return;
  }

  // App shell — cache-first
  event.respondWith(cacheFirstWithNetwork(request, CACHE_NAME));
});

async function cacheFirstWithNetwork(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return caches.match('./index.html');
  }
}

async function networkFirstWithCache(req, cacheName) {
  try {
    const res = await fetch(req, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response('', { status: 503 });
  }
}

// ─── Background Sync ─────────────────────────
// Triggered when device comes back online
self.addEventListener('sync', event => {
  if (event.tag === 'gps-background-sync') {
    event.waitUntil(syncGPSFromIDB());
  }
});

// ─── Periodic Background Sync ─────────────────
// Triggered regularly even when app is closed
self.addEventListener('periodicsync', event => {
  if (event.tag === 'gps-periodic-sync') {
    event.waitUntil(syncGPSFromIDB());
  }
});

// ─── GPS Sync from IndexedDB ─────────────────
async function syncGPSFromIDB() {
  try {
    const db      = await openIDB();
    const pending = await getAllPending(db);

    if (!pending.length) return;

    console.log(`[SW] Background syncing ${pending.length} GPS points`);

    // In production: POST to fleet API
    // await fetch('/api/fleet/gps-batch', {
    //   method:  'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body:    JSON.stringify({ truckId: 'ABC-1234', points: pending }),
    // });

    await markAllSynced(db, pending.map(p => p.id));

    // Notify all open app windows
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE', count: pending.length }));

  } catch (err) {
    console.warn('[SW] GPS sync error:', err);
  }
}

// ─── IDB Helpers (SW context) ─────────────────
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(GPS_STORE)) {
        db.createObjectStore(GPS_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function getAllPending(db) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(GPS_STORE, 'readonly');
    const req = tx.objectStore(GPS_STORE).getAll();
    req.onsuccess = () => resolve(req.result.filter(p => !p.synced));
    req.onerror   = () => reject(req.error);
  });
}

function markAllSynced(db, ids) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(GPS_STORE, 'readwrite');
    const store = tx.objectStore(GPS_STORE);
    ids.forEach(id => {
      const r = store.get(id);
      r.onsuccess = () => {
        if (r.result) { r.result.synced = true; store.put(r.result); }
      };
    });
    tx.oncomplete = resolve;
    tx.onerror    = reject;
  });
}

// ─── Push Notifications ──────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'TRAXHAUL', {
      body:    data.body    || 'Fleet update',
      icon:    './icon-192.png',
      badge:   './icon-72.png',
      tag:     data.tag     || 'fleet',
      data:    data,
      actions: [
        { action: 'view',    title: 'View' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'view') {
    event.waitUntil(self.clients.openWindow('./index.html'));
  }
});
