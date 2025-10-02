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
  let buildingSegmentsVersion = 0;
  let buildingSegmentsKey = '';
  let buildingCoverageBounds = null;
  let buildingRequestId = 0;
  const coverageCache = new Map();
  const cameraLayersCache = new Map();

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

    const activeIds = new Set();
    for (const camera of cameras) {
      if (!camera || camera.id == null) continue;
      const isSelected = camera.id === selectedCameraId;
      const appearance = getCameraAppearance(camera, isSelected);
      const entry = ensureCameraLayers(camera, appearance);
      if (!entry) continue;

      activeIds.add(camera.id);
      entry.update(camera, appearance);
      for (const layer of entry.getLayers()) {
        if (!layer) continue;
        layer.addTo(cameraLayer);
        if (isSelected && typeof layer.bringToFront === 'function') {
          layer.bringToFront();
        }
      }
    }

    for (const cameraId of Array.from(cameraLayersCache.keys())) {
      if (activeIds.has(cameraId)) continue;
      const entry = cameraLayersCache.get(cameraId);
      if (entry?.destroy) {
        entry.destroy();
      }
      cameraLayersCache.delete(cameraId);
    }

    for (const cameraId of Array.from(coverageCache.keys())) {
      if (activeIds.has(cameraId)) continue;
      coverageCache.delete(cameraId);
    }
  }

  function ensureCameraLayers(camera, appearance) {
    let entry = cameraLayersCache.get(camera.id);
    if (!entry || entry.type !== camera.type) {
      if (entry?.destroy) {
        entry.destroy();
      }
      entry = createCameraLayerEntry(camera, appearance);
      if (!entry) {
        return null;
      }
      cameraLayersCache.set(camera.id, entry);
    }
    return entry;
  }

  function createCameraLayerEntry(camera, appearance) {
    const config = getCameraTypeConfig(camera.type);
    const isPanoramic = config.isPanoramic;
    const isPtz = camera.type === 'ptz';

    if (isPtz) {
      const ptz = createRotatingPtzLayer(camera, appearance);
      if (!ptz) {
        return null;
      }
      return {
        type: camera.type,
        ptz,
        update(newCamera, newAppearance) {
          ptz.updateCamera(newCamera);
          ptz.updateAppearance(newAppearance);
        },
        getLayers() {
          return [ptz.layer];
        },
        destroy() {
          ptz.destroy();
        },
      };
    }

    const marker = L.circleMarker([camera.lat, camera.lon], {
      radius: appearance.isSelected ? 7 : 6,
      color: appearance.strokeColor,
      weight: 2,
      fillColor: appearance.mainColor,
      fillOpacity: 1,
    });
    attachSelection(marker, camera.id);

    let coveragePolygon = null;
    let directionLine = null;
    const layers = [];

    return {
      type: camera.type,
      isPanoramic,
      marker,
      update(newCamera, newAppearance) {
        layers.length = 0;

        if (!Number.isFinite(newCamera.lat) || !Number.isFinite(newCamera.lon)) {
          return;
        }

        const latLng = [newCamera.lat, newCamera.lon];
        marker.setLatLng(latLng);
        marker.setStyle({
          radius: newAppearance.isSelected ? 7 : 6,
          color: newAppearance.strokeColor,
          weight: 2,
          fillColor: newAppearance.mainColor,
          fillOpacity: 1,
        });

        const hasZone =
          newCamera.showZone !== false &&
          Number.isFinite(newCamera.range) &&
          newCamera.range > 0;

        if (hasZone) {
          if (isPanoramic) {
            if (!coveragePolygon) {
              coveragePolygon = L.polygon([], {
                color: newAppearance.strokeColor,
                weight: newAppearance.isSelected ? 2 : 1,
                opacity: 0.9,
                fillOpacity: 0.12,
                fillColor: newAppearance.mainColor,
                lineJoin: 'round',
              });
              attachSelection(coveragePolygon, newCamera.id);
            }
            const coverage = getPanoramaCoverage(newCamera);
            if (coverage?.points) {
              coveragePolygon.setLatLngs(coverage.points);
            }
            coveragePolygon.setStyle({
              color: newAppearance.strokeColor,
              weight: newAppearance.isSelected ? 2 : 1,
              opacity: 0.9,
              fillOpacity: 0.12,
              fillColor: newAppearance.mainColor,
            });
            layers.push(coveragePolygon);
          } else {
            if (!coveragePolygon) {
              coveragePolygon = L.polygon([], {
                color: newAppearance.strokeColor,
                weight: newAppearance.isSelected ? 2 : 1,
                opacity: 0.9,
                fillOpacity: 0.16,
                fillColor: newAppearance.mainColor,
                lineJoin: 'round',
              });
              attachSelection(coveragePolygon, newCamera.id);
            }
            const coverage = getDirectionalCoverage(newCamera);
            if (coverage?.points) {
              coveragePolygon.setLatLngs(coverage.points);
            }
            coveragePolygon.setStyle({
              color: newAppearance.strokeColor,
              weight: newAppearance.isSelected ? 2 : 1,
              opacity: 0.9,
              fillOpacity: 0.16,
              fillColor: newAppearance.mainColor,
            });
            layers.push(coveragePolygon);

            if (!directionLine) {
              directionLine = L.polyline([], {
                color: newAppearance.strokeColor,
                weight: newAppearance.isSelected ? 3 : 2,
                opacity: 0.8,
              });
              attachSelection(directionLine, newCamera.id);
            }

            let directionRange = newCamera.range || 40;
            if (coverage?.centerDistance != null) {
              directionRange = Math.min(directionRange, coverage.centerDistance);
            }
            const maxDirectionRange = 200;
            directionRange = Math.max(5, Math.min(directionRange, maxDirectionRange));
            const directionEnd = destination(
              newCamera.lat,
              newCamera.lon,
              directionRange,
              newCamera.azimuth ?? 0
            );
            directionLine.setLatLngs([latLng, directionEnd]);
            directionLine.setStyle({
              color: newAppearance.strokeColor,
              weight: newAppearance.isSelected ? 3 : 2,
              opacity: 0.8,
            });
            layers.push(directionLine);
          }
        }

        layers.push(marker);
      },
      getLayers() {
        return layers;
      },
      destroy() {
        if (coveragePolygon) {
          coveragePolygon.remove();
        }
        if (directionLine) {
          directionLine.remove();
        }
        marker.remove();
      },
    };
  }

  function getCameraAppearance(camera, isSelected) {
    const useInfrared = Boolean(camera?.infrared);
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

    return {
      isSelected,
      mainColor,
      strokeColor,
    };
  }

  function getDirectionalCoverage(camera) {
    if (!camera) {
      return null;
    }
    if (camera.id == null) {
      return computeDirectionalCoverage(camera, buildingSegments);
    }
    const entry = ensureCoverageEntry(camera.id);
    const raycast = ensureRaycastContext(entry, camera);
    const key = `${buildingSegmentsVersion}|${getDirectionalKey(camera)}`;
    if (entry.directionalKey !== key) {
      entry.directional = computeDirectionalCoverage(camera, buildingSegments, raycast);
      entry.directionalKey = key;
    }
    return entry.directional;
  }

  function getPanoramaCoverage(camera) {
    if (!camera) {
      return null;
    }
    if (camera.id == null) {
      return computePanoramaCoverage(camera, buildingSegments);
    }
    const entry = ensureCoverageEntry(camera.id);
    const raycast = ensureRaycastContext(entry, camera);
    const key = `${buildingSegmentsVersion}|${getPanoramaKey(camera)}`;
    if (entry.panoramaKey !== key) {
      entry.panorama = computePanoramaCoverage(camera, buildingSegments, raycast);
      entry.panoramaKey = key;
    }
    return entry.panorama;
  }

  function ensureCoverageEntry(cameraId) {
    let entry = coverageCache.get(cameraId);
    if (!entry) {
      entry = {
        directional: null,
        directionalKey: null,
        panorama: null,
        panoramaKey: null,
        raycast: null,
        raycastKey: null,
      };
      coverageCache.set(cameraId, entry);
    }
    return entry;
  }

  function ensureRaycastContext(entry, camera) {
    if (!camera || !Number.isFinite(camera.lat) || !Number.isFinite(camera.lon)) {
      entry.raycast = null;
      entry.raycastKey = null;
      return null;
    }

    const raycastKey =
      `${buildingSegmentsVersion}|${formatNumber(camera.lat)}|${formatNumber(camera.lon)}`;
    if (entry.raycastKey !== raycastKey) {
      entry.raycast = createRaycastContext(camera, buildingSegments);
      entry.raycastKey = raycastKey;
    }
    return entry.raycast;
  }

  function getDirectionalKey(camera) {
    const fov = camera?.fov ?? 90;
    const azimuth = camera?.azimuth ?? 0;
    const range = camera?.range ?? 0;
    return [camera?.lat, camera?.lon, range, azimuth, fov].map(formatNumber).join('|');
  }

  function getPanoramaKey(camera) {
    const range = camera?.range ?? 0;
    return [camera?.lat, camera?.lon, range].map(formatNumber).join('|');
  }

  function createRotatingPtzLayer(camera, appearance) {
    if (!Number.isFinite(camera.lat) || !Number.isFinite(camera.lon)) {
      return null;
    }

    const cameraState = { ...camera };
    const latLng = [cameraState.lat, cameraState.lon];
    const group = L.layerGroup();
    let currentAppearance = { ...appearance };
    const marker = L.circleMarker(latLng, {
      radius: currentAppearance.isSelected ? 7 : 6,
      color: currentAppearance.strokeColor,
      weight: 2,
      fillColor: currentAppearance.mainColor,
      fillOpacity: 1,
    });
    attachSelection(marker, camera.id);
    group.addLayer(marker);

    let beam = null;
    let direction = null;
    let raycast = null;
    let raycastKey = null;

    const shouldShowZone = () =>
      cameraState.showZone !== false && Number.isFinite(cameraState.range) && cameraState.range > 0;

    const ensureZoneLayers = () => {
      if (!shouldShowZone()) {
        if (beam) {
          group.removeLayer(beam);
          beam.remove();
          beam = null;
        }
        if (direction) {
          group.removeLayer(direction);
          direction.remove();
          direction = null;
        }
        return;
      }

      if (!beam) {
        beam = L.polygon([latLng], {
          color: currentAppearance.strokeColor,
          weight: currentAppearance.isSelected ? 2 : 1,
          opacity: 0.9,
          fillOpacity: 0.18,
          fillColor: currentAppearance.mainColor,
          lineJoin: 'round',
        });
        attachSelection(beam, camera.id);
        group.addLayer(beam);
      }

      if (!direction) {
        direction = L.polyline([latLng, latLng], {
          color: currentAppearance.strokeColor,
          weight: currentAppearance.isSelected ? 3 : 2,
          opacity: 0.8,
        });
        attachSelection(direction, camera.id);
        group.addLayer(direction);
      }
    };

    ensureZoneLayers();

    if (currentAppearance.isSelected && typeof marker.bringToFront === 'function') {
      marker.bringToFront();
    }

    const rotationSpeed = 0.65; // degrees per frame
    let rafId = null;
    let angle = cameraState.azimuth ?? 0;

    const requestFrame =
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback) => setTimeout(callback, 16);
    const cancelFrame =
      typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : (id) => clearTimeout(id);

    const updateGeometry = () => {
      if (!beam || !direction || !shouldShowZone()) {
        return;
      }

      const fov = cameraState.fov ?? 90;
      const range = Math.max(cameraState.range ?? 350, 5);
      const animatedCamera = {
        ...cameraState,
        azimuth: angle,
        fov,
        range,
      };
      const candidateKey =
        `${buildingSegmentsVersion}|${formatNumber(animatedCamera.lat)}|${formatNumber(animatedCamera.lon)}`;
      if (raycastKey !== candidateKey) {
        raycast = createRaycastContext(animatedCamera, buildingSegments);
        raycastKey = candidateKey;
      }
      const coverage = computeDirectionalCoverage(animatedCamera, buildingSegments, raycast);
      if (coverage) {
        beam.setLatLngs(coverage.points);
        const directionRange = Math.max(
          5,
          Math.min(animatedCamera.range, coverage.centerDistance ?? animatedCamera.range)
        );
        const directionEnd = destination(
          animatedCamera.lat,
          animatedCamera.lon,
          directionRange,
          angle
        );
        direction.setLatLngs([latLng, directionEnd]);
        return;
      }

      const halfFov = (animatedCamera.fov ?? 90) / 2;
      const samples = getDirectionalSampleCount(animatedCamera.fov ?? 90, animatedCamera.range ?? range);
      const startAngle = angle - halfFov;
      const fallbackPoints = [[animatedCamera.lat, animatedCamera.lon]];
      for (let i = 0; i <= samples; i += 1) {
        const rayAngle = startAngle + ((animatedCamera.fov ?? 90) * i) / samples;
        fallbackPoints.push(
          destination(animatedCamera.lat, animatedCamera.lon, animatedCamera.range, rayAngle)
        );
      }
      beam.setLatLngs(fallbackPoints);
      const directionEnd = destination(
        animatedCamera.lat,
        animatedCamera.lon,
        animatedCamera.range,
        angle
      );
      direction.setLatLngs([latLng, directionEnd]);
    };

    const animate = () => {
      angle = (angle + rotationSpeed) % 360;
      updateGeometry();
      rafId = requestFrame(animate);
    };

    const start = () => {
      stop();
      updateGeometry();
      rafId = requestFrame(animate);
    };

    const stop = () => {
      if (rafId != null) {
        cancelFrame(rafId);
        rafId = null;
      }
    };

    group.on('add', start);
    group.on('remove', stop);

    if (beam && direction) {
      start();
    }

    return {
      layer: group,
      updateCamera(updatedCamera) {
        if (!Number.isFinite(updatedCamera.lat) || !Number.isFinite(updatedCamera.lon)) {
          return;
        }
        cameraState.lat = updatedCamera.lat;
        cameraState.lon = updatedCamera.lon;
        cameraState.range = updatedCamera.range;
        cameraState.fov = updatedCamera.fov;
        cameraState.azimuth = updatedCamera.azimuth;
        cameraState.showZone = updatedCamera.showZone;
        latLng[0] = cameraState.lat;
        latLng[1] = cameraState.lon;
        marker.setLatLng(latLng);
        ensureZoneLayers();
        raycastKey = null;
        raycast = null;
        if (updatedCamera.azimuth != null) {
          angle = updatedCamera.azimuth;
        }
        updateGeometry();
        if (beam && direction && rafId == null && group._map) {
          start();
        }
        if ((!beam || !direction) && rafId != null) {
          stop();
        }
      },
      updateAppearance({ isSelected: selected, mainColor: main, strokeColor: stroke }) {
        currentAppearance = { isSelected: selected, mainColor: main, strokeColor: stroke };
        marker.setStyle({
          radius: selected ? 7 : 6,
          color: stroke,
          weight: 2,
          fillColor: main,
          fillOpacity: 1,
        });
        if (beam) {
          beam.setStyle({
            color: stroke,
            weight: selected ? 2 : 1,
            opacity: 0.9,
            fillOpacity: 0.18,
            fillColor: main,
          });
        }
        if (direction) {
          direction.setStyle({
            color: stroke,
            weight: selected ? 3 : 2,
            opacity: 0.8,
          });
        }
        if (selected && typeof marker.bringToFront === 'function') {
          marker.bringToFront();
        }
      },
      get layer() {
        return group;
      },
      destroy() {
        stop();
        group.off('add', start);
        group.off('remove', stop);
        group.remove();
      },
    };
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
    const segments = buildSegments(polygons);
    const segmentsKey = createSegmentsKey(segments);
    buildingSegments = segments;
    if (segmentsKey !== buildingSegmentsKey) {
      buildingSegmentsKey = segmentsKey;
      buildingSegmentsVersion += 1;
      for (const entry of coverageCache.values()) {
        entry.directional = null;
        entry.directionalKey = null;
        entry.panorama = null;
        entry.panoramaKey = null;
        entry.raycast = null;
        entry.raycastKey = null;
      }
    }
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

function computeDirectionalCoverage(camera, buildingSegments, raycastContext) {
  if (
    !camera ||
    !Number.isFinite(camera.lat) ||
    !Number.isFinite(camera.lon) ||
    !Number.isFinite(camera.range) ||
    camera.range <= 0
  ) {
    return null;
  }

  const fov = Math.max(10, Math.min(camera.fov ?? 90, 160));
  const halfFov = fov / 2;
  const azimuth = camera.azimuth ?? 0;
  const maxRange = camera.range;
  const raycast = raycastContext ?? createRaycastContext(camera, buildingSegments);
  const effectiveRange = getEffectiveRangeForSampling(maxRange, raycast);
  const samples = getDirectionalSampleCount(fov, effectiveRange);
  const startAngle = azimuth - halfFov;
  const points = [[camera.lat, camera.lon]];

  const centerDistance = limitRayDistance(
    camera,
    azimuth,
    maxRange,
    buildingSegments,
    raycast
  );

  for (let i = 0; i <= samples; i += 1) {
    const angle = startAngle + (fov * i) / samples;
    const distance = limitRayDistance(camera, angle, maxRange, buildingSegments, raycast);
    points.push(destination(camera.lat, camera.lon, distance, angle));
  }

  return { points, centerDistance };
}

function computePanoramaCoverage(camera, buildingSegments, raycastContext) {
  if (
    !camera ||
    !Number.isFinite(camera.lat) ||
    !Number.isFinite(camera.lon) ||
    !Number.isFinite(camera.range) ||
    camera.range <= 0
  ) {
    return null;
  }

  const maxRange = camera.range;
  const raycast = raycastContext ?? createRaycastContext(camera, buildingSegments);
  const effectiveRange = getEffectiveRangeForSampling(maxRange, raycast);
  const samples = getPanoramaSampleCount(effectiveRange);
  const points = [];

  for (let i = 0; i < samples; i += 1) {
    const angle = (360 * i) / samples;
    const distance = limitRayDistance(camera, angle, maxRange, buildingSegments, raycast);
    points.push(destination(camera.lat, camera.lon, distance, angle));
  }

  if (points.length === 0) {
    return null;
  }

  points.push(points[0]);
  return { points };
}

function limitRayDistance(camera, bearing, maxRange, buildingSegments, raycastContext) {
  if (!camera) {
    return maxRange;
  }
  const raycast = raycastContext ?? createRaycastContext(camera, buildingSegments);
  if (!raycast || !Array.isArray(raycast.segments) || raycast.segments.length === 0) {
    return maxRange;
  }

  const bearingRad = (bearing * Math.PI) / 180;
  const direction = {
    x: Math.sin(bearingRad),
    y: Math.cos(bearingRad),
  };

  let minDistance = maxRange;
  let hasIntersection = false;

  for (const segment of raycast.segments) {
    const { start, end } = segment;

    const distance = intersectRayWithSegment(direction, start, end);
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

function createRaycastContext(camera, buildingSegments) {
  if (!camera || !Number.isFinite(camera.lat) || !Number.isFinite(camera.lon)) {
    return null;
  }

  if (!Array.isArray(buildingSegments) || buildingSegments.length === 0) {
    return null;
  }

  const cosLat = Math.cos((camera.lat * Math.PI) / 180);
  const segments = [];
  let nearestObstacle = Infinity;

  for (const [start, end] of buildingSegments) {
    if (!start || !end) continue;
    const projectedStart = projectPoint(camera, start, cosLat);
    const projectedEnd = projectPoint(camera, end, cosLat);
    segments.push({ start: projectedStart, end: projectedEnd });

    const startDistance = Math.hypot(projectedStart.x, projectedStart.y);
    const endDistance = Math.hypot(projectedEnd.x, projectedEnd.y);
    nearestObstacle = Math.min(nearestObstacle, startDistance, endDistance);
  }

  if (segments.length === 0) {
    return null;
  }

  return {
    segments,
    nearestObstacle: Number.isFinite(nearestObstacle) ? nearestObstacle : null,
  };
}

function getEffectiveRangeForSampling(range, raycastContext) {
  if (!raycastContext?.nearestObstacle || !Number.isFinite(raycastContext.nearestObstacle)) {
    return range;
  }

  const minRange = range * 0.5;
  const scaledObstacle = raycastContext.nearestObstacle * 1.3;
  return Math.min(range, Math.max(minRange, scaledObstacle));
}

function getDirectionalSampleCount(fov, range) {
  const minSamples = Math.max(6, Math.ceil(fov / 6));
  const arcLength = (Math.PI * range * Math.max(fov, 1)) / 180;
  const targetSpacing = 14; // mètres
  const adaptiveSamples = Math.ceil(arcLength / targetSpacing);
  const total = Math.max(minSamples, adaptiveSamples);
  return Math.min(total, 160);
}

function getPanoramaSampleCount(range) {
  const minSamples = 72;
  const circumference = 2 * Math.PI * range;
  const targetSpacing = 12; // mètres
  const adaptiveSamples = Math.ceil(circumference / targetSpacing);
  const total = Math.max(minSamples, adaptiveSamples);
  return Math.min(total, 220);
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

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return 'null';
  }
  return Number(value).toFixed(6);
}

function createSegmentsKey(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return '';
  }
  const parts = [];
  for (const segment of segments) {
    if (!Array.isArray(segment) || segment.length < 2) {
      continue;
    }
    const [start, end] = segment;
    if (!start || !end) {
      continue;
    }
    parts.push(
      `${formatNumber(start[0])},${formatNumber(start[1])},${formatNumber(end[0])},${formatNumber(end[1])}`
    );
  }
  return parts.join('|');
}
