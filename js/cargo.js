// =============================================
// TRAXHAUL — cargo.js
// Cargo TTL countdown ring and condition log
// =============================================

const CARGO_CONFIG = {
  totalHours: 24,        // Total cold-chain window
  remainingHours: 16.3,  // Current remaining hours
  circumference: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  if (window.TraxDB) {
    const cargoData = await TraxDB.get(STORES.CARGO, 'BOL-2024-04291'); // Use actual BOL if available
    if (cargoData) {
      initAllRings(cargoData);
      startConditionLog(cargoData);
    } else {
      // Fallback or seed
      initAllRings({ ttlTotal: 24, ttlRemaining: 16.3 });
      startConditionLog();
    }
  }
});

function initAllRings(config) {
  const total = config.ttlTotal || 24;
  const remaining = config.ttlRemaining || 16.3;

  // Large cargo ring (cargo.html)
  const largeFg = document.querySelector('.ring-large .ring-fg');
  const largeBg = document.querySelector('.ring-large .ring-bg');
  if (largeFg && largeBg) {
    const r = 66;
    const circ = 2 * Math.PI * r;
    largeFg.setAttribute('stroke-dasharray', circ);
    largeBg.setAttribute('r', r);
    largeFg.setAttribute('r', r);

    const pct = remaining / total;
    largeFg.setAttribute('stroke-dashoffset', circ * (1 - pct));

    // Animate drain
    animateRingDrain(largeFg, circ, pct, total);
    updateLargeRingText(remaining);
  }

  // Small ring (index.html)
  const smallFg = document.querySelector('.ring-small .ring-fg');
  const smallBg = document.querySelector('.ring-small .ring-bg');
  if (smallFg && smallBg) {
    const r = 36;
    const circ = 2 * Math.PI * r;
    smallFg.setAttribute('stroke-dasharray', circ);
    smallBg.setAttribute('r', r);
    smallFg.setAttribute('r', r);

    const pct = remaining / total;
    smallFg.setAttribute('stroke-dashoffset', circ * (1 - pct));
    animateRingDrain(smallFg, circ, pct, total);

    const smallLabel = document.getElementById('ring-small-label');
    if (smallLabel) smallLabel.textContent = Math.round(pct * 100) + '%';
  }
}

function animateRingDrain(fg, circ, startPct, totalHours) {
  let pct = startPct;
  setInterval(() => {
    pct = Math.max(0, pct - (1 / (totalHours * 3600)));
    fg.setAttribute('stroke-dashoffset', circ * (1 - pct));

    const color = pct > 0.5 ? '#F97316' : pct > 0.25 ? '#EAB308' : '#EF4444';
    fg.setAttribute('stroke', color);
  }, 5000);
}

function updateLargeRingText(hours) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const el = document.getElementById('ttl-text');
  if (el) el.textContent = `${h}h ${m.toString().padStart(2,'0')}m`;
}

function startConditionLog(cargo) {
  const logList = document.getElementById('condition-log');
  if (!logList) return;

  // Initial update from DB if present
  if (cargo && document.getElementById('cargo-temp-val')) {
      document.getElementById('cargo-temp-val').textContent = cargo.currentTemp + '°C';
  }

  let counter = 0;
  setInterval(() => {
    counter++;
    const now = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.style.animation = 'slideInRight 0.3s ease';
    el.innerHTML = `
      <span class="t-small t-muted">${now}</span>
      <span class="t-small" style="flex:1;padding:0 12px;">GPS ping #${counter + 10}</span>
      <span class="t-small t-success">✓</span>
    `;
    logList.prepend(el);
    if (logList.children.length > 8) logList.lastChild.remove();
  }, 30000);
}
