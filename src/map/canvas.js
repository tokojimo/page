import { fetchBuildings } from './buildings.js';
import { getCameraTypeConfig } from '../utils/cameraTypes.js';

const GRENOBLE_CENTER = [45.1885, 5.7245];
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  "Données © OpenStreetMap contributeurs — Style © CARTO";
const EARTH_RADIUS = 6378137;
const DEG_TO_RAD = Math.PI / 180;
const INTERSECTION_PADDING = 0.5; // mètres

export function setupMapCanvas({ store, tooltip }) {
  const container = document.getElementById('map-view');
  if (!container || typeof L === 'undefined') return;

  const map = L.map(container, {
    zoomControl: true,
    preferCanvas: true,
  }).setView(GRENOBLE_CENTER, 14);

  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: TILE_ATTRIBUTION,
  }).addTo(map);

  const buildingLayer = L.layerGroup().addTo(map);
  const cameraLayer = L.layerGroup().addTo(map);
  const emptyState = document.querySelector('.empty-state');

  const resizeHandler = () => map.invalidateSize();
  window.addEventListener('resize', resizeHandler, { passive: true });

  let buildingSegments = [];
  let buildingCoverageBounds = null;
  let buildingRequestId = 0;

  map.on('click', (event) => {
    const { lat, lng } = event.latlng;
    const camera = store.addCamera({ lat, lon: lng });

    const { clientX, clientY } = getClientPosition(event.originalEvent);
    if (clientX != null && clientY != null) {
      tooltip.show('Caméra ajoutée', { x: clientX, y: clientY });
      tooltip.hide(1200);
    }

    store.selectCamera(camera.id);
  });

  store.subscribe(render);
  render();

  void refreshBuildings();
  map.on('moveend', () => {
    void refreshBuildings();
  });

  return {
    destroy() {
      window.removeEventListener('resize', resizeHandler);
      map.remove();
    },
  };

  function render() {
    const { cameras, selectedCameraId } = store.getState();
    cameraLayer.clearLayers();

    if (emptyState) {
      emptyState.hidden = cameras.length > 0;
    }

    for (const camera of cameras) {
      const isSelected = camera.id === selectedCameraId;
      const layers = createCameraLayers(camera, isSelected);
      for (const layer of layers) {
        layer.addTo(cameraLayer);
      }
    }
  }

  function createCameraLayers(camera, isSelected) {
    const layers = [];
    if (!Number.isFinite(camera.lat) || !Number.isFinite(camera.lon)) {
      return layers;
    }

    const latLng = [camera.lat, camera.lon];
    const config = getCameraTypeConfig(camera.type);
    const isPanoramic = config.isPanoramic;
    const useInfrared = Boolean(camera.infrared);
    const mainColor = useInfrared
      ? isSelected
        ? '#dc2626'
        : '#ef4444'
      : isSelected
      ? '#2563eb'
      : '#0ea5e9';
    const strokeColor = useInfrared
      ? isSelected
        ? '#991b1b'
        : '#b91c1c'
      : isSelected
      ? '#1d4ed8'
      : '#0284c7';

    let visionProfile = null;

    if (camera.showZone !== false && Number.isFinite(camera.range) && camera.range > 0) {
      if (isPanoramic) {
        const coverage = computePanoramaCoverage(camera, buildingSegments);
        if (coverage) {
          visionProfile = coverage;
          const circle = L.polygon(coverage.points, {
            color: strokeColor,
            weight: isSelected ? 2 : 1,
            opacity: 0.9,
            fillOpacity: 0.12,
            fillColor: mainColor,
            lineJoin: 'round',
          });
          attachSelection(circle, camera.id);
          layers.push(circle);
        }
      } else {
        const coverage = computeDirectionalCoverage(camera, buildingSegments);
        if (coverage) {
          visionProfile = coverage;
          const beam = L.polygon(coverage.points, {
            color: strokeColor,
            weight: isSelected ? 2 : 1,
            opacity: 0.9,
            fillOpacity: 0.16,
            fillColor: mainColor,
            lineJoin: 'round',
          });
          attachSelection(beam, camera.id);
          layers.push(beam);
        }
      }
    }

    if (!isPanoramic) {
      let directionRange = camera.range || 40;
      if (visionProfile?.centerDistance != null) {
        directionRange = Math.min(directionRange, visionProfile.centerDistance);
      }
      directionRange = Math.max(5, Math.min(directionRange, 200));
      const directionEnd = destination(camera.lat, camera.lon, directionRange, camera.azimuth ?? 0);
      const direction = L.polyline([latLng, directionEnd], {
        color: strokeColor,
        weight: isSelected ? 3 : 2,
        opacity: 0.8,
      });
      attachSelection(direction, camera.id);
      layers.push(direction);
    }

    const marker = L.circleMarker(latLng, {
      radius: isSelected ? 7 : 6,
      color: strokeColor,
      weight: 2,
      fillColor: mainColor,
      fillOpacity: 1,
    });
    attachSelection(marker, camera.id);
    layers.push(marker);

    if (isSelected) {
      marker.bringToFront();
    }

    return layers;
  }

  async function refreshBuildings() {
    if (!map) return;
    const viewBounds = map.getBounds();
    if (buildingCoverageBounds && buildingCoverageBounds.contains(viewBounds)) {
      return;
    }

    const fetchBounds = viewBounds.pad(0.2);
    const requestId = ++buildingRequestId;
    try {
      const polygons = await fetchBuildings(fetchBounds);
      if (requestId !== buildingRequestId) return;
      buildingCoverageBounds = fetchBounds;
      updateBuildings(polygons);
    } catch (error) {
      if (requestId === buildingRequestId) {
        // eslint-disable-next-line no-console
        console.error('Impossible de récupérer les bâtiments', error);
      }
    }
  }

  function updateBuildings(polygons) {
    buildingSegments = buildSegments(polygons);
    buildingLayer.clearLayers();
    for (const polygon of polygons) {
      const layer = L.polygon(polygon, {
        color: '#1f2937',
        weight: 1,
        opacity: 0.6,
        fillOpacity: 0.08,
        fillColor: '#4b5563',
        interactive: false,
      });
      layer.addTo(buildingLayer);
    }
    render();
  }

  function attachSelection(layer, cameraId) {
    layer.on('click', (leafletEvent) => {
      if (leafletEvent?.originalEvent) {
        L.DomEvent.stop(leafletEvent.originalEvent);
      }
      L.DomEvent.stop(leafletEvent);
      store.selectCamera(cameraId);
    });
  }
}

function getClientPosition(event) {
  if (!event) return { clientX: null, clientY: null };
  if ('clientX' in event && 'clientY' in event) {
    return { clientX: event.clientX, clientY: event.clientY };
  }
  if ('touches' in event && event.touches[0]) {
    return { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY };
  }
  return { clientX: null, clientY: null };
}

function destination(lat, lon, distance, bearingDeg) {
  const radius = EARTH_RADIUS; // Terre (m)
  const bearing = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  const angularDistance = distance / radius;

  const destLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const destLon =
    lonRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destLat)
    );

  return [(destLat * 180) / Math.PI, ((destLon * 180) / Math.PI + 540) % 360 - 180];
}

function computeDirectionalCoverage(camera, buildingSegments) {
  if (!Number.isFinite(camera.range) || camera.range <= 0) {
    return null;
  }

  const fov = Math.max(10, Math.min(camera.fov ?? 90, 160));
  const halfFov = fov / 2;
  const azimuth = camera.azimuth ?? 0;
  const maxRange = camera.range;
  const samples = Math.max(2, Math.ceil(fov / 6));
  const startAngle = azimuth - halfFov;
  const points = [[camera.lat, camera.lon]];

  const centerDistance = limitRayDistance(camera, azimuth, maxRange, buildingSegments);

  for (let i = 0; i <= samples; i += 1) {
    const angle = startAngle + (fov * i) / samples;
    const distance = limitRayDistance(camera, angle, maxRange, buildingSegments);
    points.push(destination(camera.lat, camera.lon, distance, angle));
  }

  return { points, centerDistance };
}

function computePanoramaCoverage(camera, buildingSegments) {
  if (!Number.isFinite(camera.range) || camera.range <= 0) {
    return null;
  }

  const maxRange = camera.range;
  const samples = 72;
  const points = [];

  for (let i = 0; i < samples; i += 1) {
    const angle = (360 * i) / samples;
    const distance = limitRayDistance(camera, angle, maxRange, buildingSegments);
    points.push(destination(camera.lat, camera.lon, distance, angle));
  }

  if (points.length === 0) {
    return null;
  }

  points.push(points[0]);
  return { points };
}

function limitRayDistance(camera, bearing, maxRange, buildingSegments) {
  if (!Array.isArray(buildingSegments) || buildingSegments.length === 0) {
    return maxRange;
  }

  const cosLat = Math.cos((camera.lat * Math.PI) / 180);
  const bearingRad = (bearing * Math.PI) / 180;
  const direction = {
    x: Math.sin(bearingRad),
    y: Math.cos(bearingRad),
  };

  let minDistance = maxRange;
  let hasIntersection = false;

  for (const [start, end] of buildingSegments) {
    const a = projectPoint(camera, start, cosLat);
    const b = projectPoint(camera, end, cosLat);

    const distance = intersectRayWithSegment(direction, a, b);
    if (distance == null) continue;
    if (distance < 0.5) continue;
    if (distance < minDistance) {
      minDistance = distance;
      hasIntersection = true;
    }
  }

  if (hasIntersection) {
    return Math.max(0, Math.min(maxRange, minDistance - INTERSECTION_PADDING));
  }

  return maxRange;
}

function projectPoint(camera, point, cosLat) {
  const dLat = (point[0] - camera.lat) * DEG_TO_RAD * EARTH_RADIUS;
  const dLon = (point[1] - camera.lon) * DEG_TO_RAD * EARTH_RADIUS * cosLat;
  return { x: dLon, y: dLat };
}

function intersectRayWithSegment(direction, start, end) {
  const segment = { x: end.x - start.x, y: end.y - start.y };
  const denominator = direction.x * segment.y - direction.y * segment.x;
  if (Math.abs(denominator) < 1e-8) {
    return null;
  }

  const crossStartSegment = start.x * segment.y - start.y * segment.x;
  const t = crossStartSegment / denominator;
  if (t < 0) {
    return null;
  }

  const crossStartDirection = start.x * direction.y - start.y * direction.x;
  const u = crossStartDirection / denominator;
  if (u < 0 || u > 1) {
    return null;
  }

  return t;
}

function buildSegments(polygons) {
  const segments = [];
  if (!Array.isArray(polygons)) {
    return segments;
  }

  for (const polygon of polygons) {
    for (let i = 1; i < polygon.length; i += 1) {
      const start = polygon[i - 1];
      const end = polygon[i];
      if (!start || !end) continue;
      segments.push([start, end]);
    }
  }

  return segments;
}
