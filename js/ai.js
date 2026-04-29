// =============================================
// TRAXHAUL — ai.js
// Vertex AI (Gemma model) integration
// for route risk, ETA, and spoilage analysis
// =============================================

// ─── Vertex AI Configuration ─────────────────
// NOTE: For production, proxy this through your
// backend server to avoid exposing credentials.
// Replace with your GCP Project ID and region.
const VERTEX_CONFIG = {
  projectId:  'traxhaul-fleet',     // Replace with your GCP Project ID
  location:   'us-central1',
  model:      'gemma-3-12b-it',     // Gemma 3 12B via Vertex AI
  // Bearer token should come from a server-side auth proxy in production
  // For demo: falls back to heuristic analysis when not configured
  apiKeyProxy: null,
};

const VERTEX_ENDPOINT = `https://${VERTEX_CONFIG.location}-aiplatform.googleapis.com/v1/projects/${VERTEX_CONFIG.projectId}/locations/${VERTEX_CONFIG.location}/publishers/google/models/${VERTEX_CONFIG.model}:generateContent`;

// ... (Vertex Config remains same)

// ─── Public API ──────────────────────────────
const TraxhaulAI = {
  async getContext() {
    if (!window.TraxDB) return null;
    
    const delivery = await TraxDB.get(STORES.DELIVERIES, 'active');
    const cargo = await TraxDB.get(STORES.CARGO, 'BOL-2024-04291');
    
    if (!delivery || !cargo) return null;

    return {
      cargo:         cargo.type,
      origin:        delivery.origin,
      destination:   delivery.destination,
      currentTemp:   cargo.currentTemp,
      drivingHours:  5.1, // simulation
      delayMinutes:  0,
      roadCondition: 'Clear skies',
      remainingKm:   527,
      etaHours:      4.5,
      ttlHours:      cargo.ttlRemaining,
    };
  },

  async analyze() {
    const ctx = await this.getContext();
    if (!ctx) return localHeuristicAnalysis({ ttlHours: 16, etaHours: 4, currentTemp: 4, drivingHours: 1 });

    try {
      const result = await callVertexGemma(buildPrompt(ctx));
      return parseGemmaResponse(result, ctx);
    } catch (err) {
      console.warn('[AI] Vertex AI unavailable, using local heuristics:', err.message);
      return localHeuristicAnalysis(ctx);
    }
  },

  async analyzeRoute(routeData) {
    const ctx = await this.getContext();
    try {
      const prompt = buildRoutePrompt(routeData);
      const result = await callVertexGemma(prompt);
      return parseGemmaResponse(result, ctx);
    } catch {
      return localHeuristicAnalysis({ ...ctx, ...routeData });
    }
  },
};

// ... (Vertex API Call remains same)

// ─── Response Parser ─────────────────────────
function parseGemmaResponse(vertexRes, ctx) {
  try {
    const text = vertexRes?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const clean = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    return { ...JSON.parse(clean), source: 'gemma-vertex' };
  } catch {
    return localHeuristicAnalysis(ctx);
  }
}

// ... (Heuristic and Renderer remain similar but I'll update the refresh part)

async function renderAIInsights(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="ai-loading">
      <div class="ai-spinner"></div>
      <span class="t-xs t-muted">Analyzing route…</span>
    </div>
  `;

  const data = await TraxhaulAI.analyze();

  const riskColors = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' };
  const riskColor  = riskColors[data.riskLevel] || 'warning';
  const srcLabel   = data.source === 'gemma-vertex' ? 'Gemma · Vertex AI' : 'Local Analysis';

  container.innerHTML = `
    <div class="ai-panel">
      <div class="ai-panel-header">
        <div class="flex items-center gap-8">
          <span style="font-size:18px;">🧠</span>
          <div>
            <div class="t-label" style="color:var(--secondary);">ROUTE ANALYSIS</div>
            <div class="t-xs t-muted" style="margin-top:1px;">${srcLabel}</div>
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
          <div class="t-label">Driver Fatigue</div>
          <div class="badge badge-${riskColors[data.driverFatigueRisk] || 'warning'}" style="margin-top:4px;font-size:10px;">${data.driverFatigueRisk}</div>
        </div>
        <div class="ai-score-item">
          <div class="t-label">Delay Risk</div>
          <div class="badge badge-${data.predictedDelayMinutes > 30 ? 'warning' : 'success'}" style="margin-top:4px;font-size:10px;">
            +${data.predictedDelayMinutes}m
          </div>
        </div>
        <div class="ai-score-item">
          <div class="t-label">Confidence</div>
          <div style="font-size:15px;font-weight:900;margin-top:4px;color:var(--text);">${data.confidencePercent}%</div>
        </div>
      </div>

      <div class="ai-insight">
        <div class="t-small" style="font-weight:700;margin-bottom:4px;">📊 ${data.topInsight}</div>
        <div class="t-xs t-muted">→ ${data.recommendation}</div>
      </div>

      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:12px;"
              onclick="refreshAIInsights()">
        ↻ Refresh Analysis
      </button>
    </div>
  `;
}

window.refreshAIInsights = () => renderAIInsights('ai-insights');

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('ai-insights')) {
    renderAIInsights('ai-insights');
  }
});
