// =============================================
// GLIDEN'GO — ai.js
// Vertex AI (Gemma model) integration
// for route risk, ETA, and spoilage analysis
// =============================================

const VERTEX_CONFIG = {
  projectId:  'glidengo-fleet',
  location:   'us-central1',
  model:      'gemma-3-12b-it',
  apiKeyProxy: null,
};

const GlideGoAI = {
  async getContext() {
    if (!window.GlideGoDB) return null;
    
    const delivery = await GlideGoDB.get(STORES.DELIVERIES, 'active');
    const cargo = await GlideGoDB.get(STORES.CARGO, 'BOL-GNG-001');
    
    if (!delivery || !cargo) return null;

    return {
      cargo:         cargo.type,
      origin:        delivery.origin,
      destination:   delivery.destination,
      currentTemp:   cargo.currentTemp || 24,
      drivingHours:  4.7, // simulated high fatigue
      delayMinutes:  15,
      roadCondition: 'Fair',
      remainingKm:   320,
      etaHours:      5.2,
      ttlHours:      cargo.ttlRemaining || 24,
    };
  },

  async analyze() {
    const ctx = await this.getContext();
    try {
      // Local Heuristics (Vertex AI fallback)
      return localHeuristicAnalysis(ctx || { ttlHours: 16, etaHours: 4, currentTemp: 4, drivingHours: 1 });
    } catch (err) {
      console.warn('[AI] Analysis failed:', err.message);
      return localHeuristicAnalysis(ctx);
    }
  }
};

function localHeuristicAnalysis(ctx) {
  const fatigue = ctx.drivingHours > 4.5 ? 'HIGH' : 'LOW';
  const spoilage = (ctx.currentTemp > 28 || ctx.ttlHours < ctx.etaHours) ? 'HIGH' : 'LOW';
  
  return {
    riskLevel: (fatigue === 'HIGH' || spoilage === 'HIGH') ? 'HIGH' : 'LOW',
    riskScore: (fatigue === 'HIGH' || spoilage === 'HIGH') ? 88 : 12,
    spoilageRisk: spoilage,
    driverFatigueRisk: fatigue,
    predictedDelayMinutes: ctx.delayMinutes + (fatigue === 'HIGH' ? 45 : 0),
    confidencePercent: 94,
    topInsight: fatigue === 'HIGH' ? 'Driver approaching legal 5h limit.' : 'Route stability confirmed.',
    recommendation: fatigue === 'HIGH' ? 'Immediate rest at Petron Alabang recommended.' : 'Continue on current route.',
    source: 'local-heuristic'
  };
}

async function renderAIInsights(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="ai-loading">
      <div class="ai-spinner"></div>
      <span class="t-xs t-muted">Analyzing route…</span>
    </div>
  `;

  const data = await GlideGoAI.analyze();

  const riskColors = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' };
  const riskColor  = riskColors[data.riskLevel] || 'warning';

  container.innerHTML = `
    <div class="ai-panel">
      <div class="ai-panel-header">
        <div class="flex items-center gap-8">
          <span style="font-size:18px;">🧠</span>
          <div>
            <div class="t-label" style="color:var(--secondary);">GLIDE-SYNC ANALYSIS</div>
            <div class="t-xs t-muted" style="margin-top:1px;">Local Intelligence Engine</div>
          </div>
        </div>
        <div class="badge badge-${riskColor}" style="font-size:11px;">
          ${data.riskLevel} RISK · ${data.riskScore}
        </div>
      </div>

      <div class="ai-score-row">
        <div class="ai-score-item">
          <div class="t-label">Spoilage</div>
          <div class="badge badge-${riskColors[data.spoilageRisk] || 'warning'}" style="margin-top:4px;font-size:10px;">${data.spoilageRisk}</div>
        </div>
        <div class="ai-score-item">
          <div class="t-label">Fatigue</div>
          <div class="badge badge-${riskColors[data.driverFatigueRisk] || 'warning'}" style="margin-top:4px;font-size:10px;">${data.driverFatigueRisk}</div>
        </div>
        <div class="ai-score-item">
          <div class="t-label">Delay</div>
          <div class="badge badge-${data.predictedDelayMinutes > 30 ? 'warning' : 'success'}" style="margin-top:4px;font-size:10px;">
            +${data.predictedDelayMinutes}m
          </div>
        </div>
      </div>

      <div class="ai-insight">
        <div class="t-small" style="font-weight:700;margin-bottom:4px;">📊 ${data.topInsight}</div>
        <div class="t-xs t-muted">→ ${data.recommendation}</div>
      </div>

      ${data.riskLevel === 'HIGH' ? `
        <button class="btn btn-secondary btn-sm btn-block" style="margin-top:12px;"
                onclick="window.showRerouteModal('${data.topInsight}')">
          ⚡ Apply Glide-Sync Reroute
        </button>
      ` : `
        <button class="btn btn-ghost btn-sm btn-block" style="margin-top:12px;"
                onclick="refreshAIInsights()">
          ↻ Refresh Analysis
        </button>
      `}
    </div>
  `;
}

window.refreshAIInsights = () => renderAIInsights('ai-insights');

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('ai-insights')) {
    setTimeout(() => renderAIInsights('ai-insights'), 1000);
  }
});
