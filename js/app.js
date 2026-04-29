// =============================================
// GLIDEN'GO — app.js
// Core app initialization, connection status,
// page transitions, and shared utilities
// =============================================

document.addEventListener('DOMContentLoaded', async () => {
  // Page fade-in
  requestAnimationFrame(() => {
    document.body.classList.add('loaded');
  });

  // Database initialization
  if (window.SeedData) {
    await SeedData.init();
    console.log('[GLIDEN\'GO] Database initialized');
  }

  // Theme initialization
  initTheme();

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('[GLIDEN\'GO] Service Worker registered'))
      .catch(err => console.warn('[GLIDEN\'GO] SW error:', err));
  }

  // Connection tracking
  initConnectionStatus();
  window.addEventListener('online',  updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);

  // Mark active nav item
  markActiveNav();

  // Filter pills (shared)
  initFilterPills();

  // Reroute modal (if present)
  initRerouteModal();

  // Destination logic
  initDestinationSelector();

  // Settings page specific logic
  if (window.location.pathname.includes('settings.html')) {
      initSettingsPage();
  }

  // Dashboard Updates
  refreshDashboard();
  window.addEventListener('hardware-update', () => refreshDashboard());

  // Start dynamic ETA
  startETACountdown();
});

// ─── Theme Management ──────────────────────
async function initTheme() {
    if (!window.GlideGoDB) return;
    const config = await GlideGoDB.get(STORES.SETTINGS, 'app_config');
    if (config?.lightMode) {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

async function toggleTheme(isLight) {
    if (!window.GlideGoDB) return;
    const config = await GlideGoDB.get(STORES.SETTINGS, 'app_config') || {};
    config.lightMode = isLight;
    await GlideGoDB.put(STORES.SETTINGS, { ...config, key: 'app_config' });
    initTheme();
}

// ─── Destination Selection ──────────────────
function initDestinationSelector() {
    const editBtn = document.getElementById('btn-edit-route');
    if (!editBtn) return;

    editBtn.addEventListener('click', () => {
        const newDest = prompt('Enter new target location (City/Region):', 'Manila');
        if (newDest) {
            updateTargetLocation(newDest);
        }
    });
}

async function updateTargetLocation(name) {
    if (!window.GlideGoDB) return;
    const delivery = await GlideGoDB.get(STORES.DELIVERIES, 'active');
    if (delivery) {
        delivery.destination = name;
        // In a real app, we'd use Geocoding API here. 
        // For now, we'll simulate coordinates based on the name or keep current if unknown.
        if (name.toLowerCase().includes('manila')) {
            delivery.destCoords = { lat: 14.5995, lng: 120.9842 };
        } else if (name.toLowerCase().includes('cebu')) {
            delivery.destCoords = { lat: 10.3157, lng: 123.8854 };
        } else if (name.toLowerCase().includes('davao')) {
            delivery.destCoords = { lat: 7.0707, lng: 125.6087 };
        }
        
        await GlideGoDB.put(STORES.DELIVERIES, delivery);
        showToast(`Target Location updated to ${name}`, 'success');
        refreshDashboard();
        // Notify other windows (like map)
        window.dispatchEvent(new CustomEvent('route-updated'));
    }
}

// ─── Settings Logic ─────────────────────────
async function initSettingsPage() {
    const lightToggle = document.getElementById('toggle-light-mode');
    if (!lightToggle || !window.GlideGoDB) return;

    const config = await GlideGoDB.get(STORES.SETTINGS, 'app_config');
    lightToggle.checked = !!config?.lightMode;

    lightToggle.addEventListener('change', (e) => {
        toggleTheme(e.target.checked);
    });
}

async function refreshDashboard() {
  if (!window.GlideGoDB) return;
  
  const delivery = await GlideGoDB.get(STORES.DELIVERIES, 'active');
  if (!delivery) return;

  // Update Plate
  const plateEl = document.getElementById('dash-plate');
  if (plateEl) plateEl.textContent = delivery.plate;

  // Update Route
  const originEl = document.getElementById('dash-origin');
  if (originEl) originEl.textContent = delivery.origin;
  const destEl = document.getElementById('dash-dest');
  if (destEl) destEl.textContent = delivery.destination;

  // Update Driver/Assistant
  const driverEl = document.getElementById('dash-driver');
  if (driverEl) driverEl.textContent = delivery.driver;
  const assistantEl = document.getElementById('dash-assistant');
  if (assistantEl) assistantEl.textContent = delivery.assistant || 'No Assistant';

  // Update Status
  const statusEl = document.getElementById('dash-status-label');
  if (statusEl) statusEl.textContent = `● ${delivery.status}`;

  // Update Cargo
  const cargo = await GlideGoDB.get(STORES.CARGO, 'BOL-GNG-001');
  if (cargo) {
    const cargoTypeEl = document.getElementById('dash-cargo-type');
    if (cargoTypeEl) cargoTypeEl.textContent = cargo.type;
    
    // TTL Progress
    const ttlPercent = Math.round((cargo.ttlRemaining / cargo.ttlTotal) * 100);
    const ttlText = document.getElementById('dash-ttl-percent');
    if (ttlText) ttlText.textContent = `${ttlPercent}%`;
    const ttlCircle = document.getElementById('dash-ttl-circle');
    if (ttlCircle) {
        const offset = 226 - (226 * ttlPercent / 100);
        ttlCircle.style.strokeDashoffset = offset;
    }
  }

  // Calculate Distance (Simulated for PH Highways)
  if (delivery.coords && delivery.destCoords) {
      const dist = calculateDistance(delivery.coords, delivery.destCoords);
      const distText = document.getElementById('dash-progress-text');
      const progressPercent = Math.min(100, Math.round((1 - (dist / 1200)) * 100)); // 1200km total roughly
      if (distText) distText.textContent = `${progressPercent}% complete · ${Math.round(dist)} km remaining`;
      const progressBar = document.getElementById('dash-progress-bar');
      if (progressBar) progressBar.style.width = `${progressPercent}%`;
  }
}

function calculateDistance(c1, c2) {
    const R = 6371;
    const dLat = (c2.lat - c1.lat) * Math.PI / 180;
    const dLon = (c2.lng - c1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(c1.lat * Math.PI/180) * Math.cos(c2.lat * Math.PI/180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// ─── Connection Status ──────────────────────
function initConnectionStatus() {
  const pill = document.getElementById('conn-pill');
  if (!pill) return;
  updateConnectionStatus();
}

function updateConnectionStatus() {
  const pill = document.getElementById('conn-pill');
  if (!pill) return;
  if (navigator.onLine) {
    pill.textContent = 'Online';
    pill.className = 'connection-pill pill-online';
  } else {
    pill.textContent = 'Offline';
    pill.className = 'connection-pill pill-offline';
  }
}

function markActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(link => {
    if (link.getAttribute('href') === path) link.classList.add('active');
  });
}

function initFilterPills() {
  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', function() {
      this.parentElement.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      this.classList.add('active');
    });
  });
}

function initRerouteModal() {
  window.showRerouteModal = (reason) => {
    if (window.GlideGoHardware) {
        GlideGoHardware.sendAlert('REROUTE');
    }
    showToast(`Reroute Triggered: ${reason}`, 'warning');
  };
}

function showToast(msg, type='info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type} toast-show`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── ETA Countdown (home) ───────────────────
async function startETACountdown() {
  const el = document.getElementById('eta-value');
  if (!el || !window.GlideGoDB) return;

  const update = async () => {
    const delivery = await GlideGoDB.get(STORES.DELIVERIES, 'active');
    if (!delivery) return;
    
    if (delivery.coords && delivery.destCoords) {
        const dist = calculateDistance(delivery.coords, delivery.destCoords);
        const totalMin = Math.round((dist / 60) * 60);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        el.textContent = `${h}h ${m.toString().padStart(2,'0')}m`;
    }
  };

  update();
  setInterval(update, 60000);
}

window.showToast = showToast;
