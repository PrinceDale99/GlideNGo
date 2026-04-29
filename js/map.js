// =============================================
// GLIDEN'GO — map.js
// Google Maps API integration
// =============================================

const GMAPS_KEY = 'AIzaSyBArg1l-vrUcPHx9yfB7mUPbQld7dsTD5Y';

// ─── Coordinates ────────────────────────────
const MANILA  = { lat: 14.5995, lng: 120.9842 };
const DAVAO   = { lat: 7.0707,  lng: 125.6087 };

// Philippine dark map style
const DARK_MAP_STYLE = [
  { elementType: 'geometry',        stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8b949e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#21262d' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9aa3af' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bababf' }] },
  { featureType: 'poi',             stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park',        elementType: 'geometry', stylers: [{ color: '#161b22' }] },
  { featureType: 'poi.park',        elementType: 'labels.text.fill', stylers: [{ color: '#4d6b53' }] },
  { featureType: 'road',            elementType: 'geometry', stylers: [{ color: '#21262d' }] },
  { featureType: 'road',            elementType: 'geometry.stroke', stylers: [{ color: '#161b22' }] },
  { featureType: 'road',            elementType: 'labels.text.fill', stylers: [{ color: '#8b949e' }] },
  { featureType: 'road.highway',    elementType: 'geometry', stylers: [{ color: '#2a3140' }] },
  { featureType: 'road.highway',    elementType: 'geometry.stroke', stylers: [{ color: '#1a2030' }] },
  { featureType: 'road.highway',    elementType: 'labels.text.fill', stylers: [{ color: '#b0b8c4' }] },
  { featureType: 'transit',         stylers: [{ visibility: 'off' }] },
  { featureType: 'water',           elementType: 'geometry', stylers: [{ color: '#0a0e14' }] },
  { featureType: 'water',           elementType: 'labels.text.fill', stylers: [{ color: '#3d4c5c' }] },
];

// ─── Driver Map ─────────────────────────────
let driverMap, driverMarker;

async function initDriverMap() {
  console.log('[GLIDEN\'GO] Initializing Driver Map...');
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  // Fallback origin
  let origin = MANILA;
  let destination = DAVAO;
  let deliveryTitle = 'Laguna → Davao';

  if (window.GlideGoDB) {
    try {
      const delivery = await GlideGoDB.get(STORES.DELIVERIES, 'active');
      if (delivery) {
        origin = delivery.coords || MANILA;
        destination = delivery.destCoords || DAVAO;
        deliveryTitle = `${delivery.origin} → ${delivery.destination}`;
      }
    } catch (e) {
      console.warn('[GLIDEN\'GO] DB fetch failed, using fallbacks', e);
    }
  }

  driverMap = new google.maps.Map(mapEl, {
    center: origin,
    zoom: 12,
    styles: DARK_MAP_STYLE,
    disableDefaultUI: true,
    gestureHandling: 'greedy',
    backgroundColor: '#0d1117'
  });

  // Truck marker (current position)
  driverMarker = new google.maps.Marker({
    position: origin,
    map: driverMap,
    title: 'Your Truck',
    icon: {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 7,
      fillColor: '#3B82F6',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    },
    zIndex: 10,
  });

  // Destination marker
  new google.maps.Marker({
    position: destination,
    map: driverMap,
    title: deliveryTitle,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: '#EF4444',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    },
  });

  // Draw real route
  const directionsService  = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer({
    map: driverMap,
    suppressMarkers: true,
    polylineOptions: { strokeColor: '#F97316', strokeWeight: 5, strokeOpacity: 0.8 },
  });

  directionsService.route({
    origin: origin,
    destination: destination,
    travelMode: google.maps.TravelMode.DRIVING,
    region: 'PH',
  }, (result, status) => {
    if (status === 'OK') {
      directionsRenderer.setDirections(result);
    } else {
      console.warn('[GLIDEN\'GO] Directions API failed:', status);
    }
  });

  // Hardware Sync: Move marker when Node sends new coordinates
  window.addEventListener('hardware-update', (e) => {
      const { lat, lng } = e.detail;
      const newPos = new google.maps.LatLng(lat, lng);
      if (driverMarker) driverMarker.setPosition(newPos);
      if (driverMap) driverMap.panTo(newPos);
  });
}

// ─── Dispatcher Fleet Map ────────────────────
let dispatcherMap;

async function initDispatcherMap() {
  const mapEl = document.getElementById('fleet-map');
  if (!mapEl) return;

  dispatcherMap = new google.maps.Map(mapEl, {
    center: { lat: 12.0, lng: 123.0 },
    zoom: 6,
    styles: DARK_MAP_STYLE,
    disableDefaultUI: false,
    zoomControl: true,
    backgroundColor: '#0d1117'
  });

  if (window.GlideGoDB) {
    const fleet = await GlideGoDB.getAll(STORES.FLEET);
    const activeDelivery = await GlideGoDB.get(STORES.DELIVERIES, 'active');
    
    const allTrucks = [
        { plate: activeDelivery?.plate, coords: activeDelivery?.coords, status: activeDelivery?.status, color: '#22C55E' },
        ...fleet.map(f => ({ ...f, color: f.status === 'DELAYED' ? '#EAB308' : '#3B82F6' }))
    ];

    allTrucks.forEach(truck => {
      if (!truck.coords) return;
      new google.maps.Marker({
        position: truck.coords,
        map: dispatcherMap,
        label: { text: `🚛 ${truck.plate}`, color: '#fff', fontSize: '10px' },
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          fillColor: truck.color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 1,
          scale: 5,
        },
      });
    });
  }
}

// ─── Init entry points ───────────────────────
window.glidenGoMapInit = async function () {
  console.log('[GLIDEN\'GO] Google Maps Callback Triggered');
  
  // Wait for DB if not ready
  let attempts = 0;
  while (!window.GlideGoDB && attempts < 20) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }

  if (document.getElementById('map'))       await initDriverMap();
  if (document.getElementById('fleet-map')) await initDispatcherMap();
};

window.traxhaulMapInit = window.glidenGoMapInit; // Aliasing for safety
