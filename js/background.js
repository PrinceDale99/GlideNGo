// =============================================
// GLIDEN'GO — background.js
// Background GPS data collection & MQTT Hardware Bridge
// =============================================

const SYNC_TAG   = 'gps-background-sync';
const MQTT_BROKER = 'wss://broker.hivemq.com:8884/mqtt'; // Use WebSocket for browser

// ─── GPS Watcher ─────────────────────────────
let watchId = null;

const BackgroundGPS = {
  start() {
    if (!navigator.geolocation) return;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);

    watchId = navigator.geolocation.watchPosition(
      position => this._onPosition(position),
      err      => console.warn('[BG] GPS error:', err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
    this._updateStatusBadge();
  },

  async _onPosition(pos) {
    if (!window.GlideGoDB) return;
    const point = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      ts:  Date.now(),
      synced: false
    };
    await GlideGoDB.put(STORES.GPS_LOGS, point);
    this._updateLiveDisplay(point);
    if (navigator.onLine) await BackgroundSync.flush();
  },

  _updateLiveDisplay(point) {
    const coordEl = document.getElementById('live-coords');
    if (coordEl) coordEl.textContent = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  },

  _updateStatusBadge() {
    const badge = document.getElementById('bg-collect-badge');
    if (badge) {
      badge.style.display = 'inline-flex';
      badge.textContent   = '● Collecting';
    }
  }
};

// ─── MQTT Hardware Bridge ────────────────────
const GlideGoHardware = {
  client: null,

  async init() {
    if (!window.mqtt) {
        console.warn('[Hardware] MQTT library not loaded');
        return;
    }

    console.log('[Hardware] Connecting to MQTT broker...');
    this.client = mqtt.connect(MQTT_BROKER);

    this.client.on('connect', () => {
      console.log('[Hardware] Connected to GlideN\'Go Hardware Node');
      this.client.subscribe('fleet/system/tracker');
    });

    this.client.on('message', async (topic, payload) => {
      if (topic === 'fleet/system/tracker') {
        const data = JSON.parse(payload.toString());
        await this._handleHardwareUpdate(data);
      }
    });
  },

  async _handleHardwareUpdate(data) {
    if (!window.GlideGoDB) return;

    // 1. Update Active Delivery Location
    const active = await GlideGoDB.get(STORES.DELIVERIES, 'active');
    if (active) {
        active.coords = { lat: data.lat, lng: data.lng };
        await GlideGoDB.put(STORES.DELIVERIES, active);
    }

    // 2. Update Cargo Temperature
    const cargo = await GlideGoDB.get(STORES.CARGO, 'BOL-GNG-001');
    if (cargo && data.temp) {
        cargo.currentTemp = data.temp;
        await GlideGoDB.put(STORES.CARGO, cargo);
    }

    console.log('[Hardware] Integrated update:', data);
    
    // Broadcast event for UI update
    window.dispatchEvent(new CustomEvent('hardware-update', { detail: data }));
  },

  sendAlert(cmd) {
    if (this.client && this.client.connected) {
      this.client.publish('fleet/system/alerts', cmd);
      console.log('[Hardware] Sent alert to Cab:', cmd);
    }
  }
};

// ─── Background Sync ─────────────────────────
const BackgroundSync = {
  async flush() {
    if (!window.GlideGoDB) return;
    const all = await GlideGoDB.getAll(STORES.GPS_LOGS);
    const pending = all.filter(p => !p.synced);
    if (!pending.length) return;

    // Mark as synced in DB
    for (const p of pending) {
        p.synced = true;
        await GlideGoDB.put(STORES.GPS_LOGS, p);
    }
    this._updatePendingCount();
  },

  async _updatePendingCount() {
    if (!window.GlideGoDB) return;
    const all = await GlideGoDB.getAll(STORES.GPS_LOGS);
    const n = all.filter(p => !p.synced).length;
    const el = document.getElementById('pending-logs');
    if (el) el.textContent = n;
  }
};

// ─── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  BackgroundGPS.start();
  
  // Try to init hardware bridge
  if (window.mqtt) {
      GlideGoHardware.init();
  } else {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/mqtt/dist/mqtt.min.js';
      script.onload = () => GlideGoHardware.init();
      document.head.appendChild(script);
  }

  window.addEventListener('online', () => BackgroundSync.flush());
  BackgroundSync._updatePendingCount();
});

window.BackgroundGPS = BackgroundGPS;
window.BackgroundSync = BackgroundSync;
window.GlideGoHardware = GlideGoHardware;
