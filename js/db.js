// =============================================
// GLIDEN'GO — db.js
// Centralized IndexedDB Management
// =============================================

const DB_NAME = 'glidengo-v1-db';
const DB_VERSION = 1;

const STORES = {
  DELIVERIES: 'deliveries',
  CARGO:      'cargo',
  FLEET:      'fleet',
  SETTINGS:   'settings',
  GPS_LOGS:   'gps_logs'
};

const GlideGoDB = {
  _db: null,

  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Deliveries Store
        if (!db.objectStoreNames.contains(STORES.DELIVERIES)) {
          db.createObjectStore(STORES.DELIVERIES, { keyPath: 'id' });
        }
        
        // Cargo Store
        if (!db.objectStoreNames.contains(STORES.CARGO)) {
          db.createObjectStore(STORES.CARGO, { keyPath: 'bolNumber' });
        }
        
        // Fleet Store (for dispatcher/owner)
        if (!db.objectStoreNames.contains(STORES.FLEET)) {
          db.createObjectStore(STORES.FLEET, { keyPath: 'plate' });
        }
        
        // Settings Store
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }

        // GPS Logs Store
        if (!db.objectStoreNames.contains(STORES.GPS_LOGS)) {
          const logStore = db.createObjectStore(STORES.GPS_LOGS, { keyPath: 'id', autoIncrement: true });
          logStore.createIndex('synced', 'synced', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this._db = event.target.result;
        resolve(this._db);
      };

      request.onerror = (event) => reject(event.target.error);
    });
  },

  async get(storeName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getAll(storeName) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async put(storeName, data) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async delete(storeName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};

// Initial Data Seed Utility
const SeedData = {
  async init() {
    const activeDelivery = await GlideGoDB.get(STORES.DELIVERIES, 'active');
    if (!activeDelivery) {
      console.log('[DB] Seeding GlideN\'Go initial data...');
      
      // Seed Active Delivery
      await GlideGoDB.put(STORES.DELIVERIES, {
        id: 'active',
        origin: 'FPIP, Laguna',
        destination: 'Davao City',
        coords: { lat: 14.212, lng: 121.157 },
        destCoords: { lat: 7.0707, lng: 125.6087 },
        plate: 'GNG 2024',
        driver: 'Glide Master Juan',
        assistant: 'Kiko "Pahinante" Reyes',
        startTime: Date.now() - (6 * 3600000), 
        status: 'ON TIME',
        progress: 38
      });

      // Seed Cargo
      await GlideGoDB.put(STORES.CARGO, {
        bolNumber: 'BOL-GNG-001',
        type: 'Perishable (Cold Chain)',
        tempRange: '2°C – 8°C',
        consignee: 'Metro Pacific Cold Storage',
        consigneeLoc: 'Davao City',
        shipper: 'Nestlé Philippines',
        shipperLoc: 'FPIP, Laguna',
        weight: '18,400 kg',
        ttlTotal: 24, 
        ttlRemaining: 16.3,
        currentTemp: 4.2
      });

      // Seed Fleet
      await GlideGoDB.put(STORES.FLEET, {
        plate: 'GO 7788',
        driver: 'Ben Glide',
        origin: 'Cebu',
        destination: 'General Santos',
        status: 'DELAYED',
        coords: { lat: 10.3157, lng: 123.8854 }
      });

      // Seed Settings
      await GlideGoDB.put(STORES.SETTINGS, { key: 'user_profile', name: 'Glide Master Juan', license: 'GNG-24-004291', truck: 'GNG 2024' });
      await GlideGoDB.put(STORES.SETTINGS, { key: 'app_config', offlineMapsUsed: 1.24, voiceNav: true, notifications: true });
    }
  }
};

window.GlideGoDB = GlideGoDB;
window.STORES = STORES;
window.SeedData = SeedData;
