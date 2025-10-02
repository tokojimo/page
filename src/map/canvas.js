const GRENOBLE_CENTER = [45.1885, 5.7245];
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  "Données © OpenStreetMap contributeurs — Style © CARTO";

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

  const cameraLayer = L.layerGroup().addTo(map);
  const emptyState = document.querySelector('.empty-state');

  const resizeHandler = () => map.invalidateSize();
  window.addEventListener('resize', resizeHandler, { passive: true });

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
    const mainColor = isSelected ? '#2563eb' : '#0ea5e9';
    const strokeColor = isSelected ? '#1d4ed8' : '#0284c7';

    if (camera.showZone !== false && Number.isFinite(camera.range) && camera.range > 0) {
      if (camera.type === 'panorama') {
        const circle = L.circle(latLng, {
          radius: camera.range,
          color: strokeColor,
          weight: isSelected ? 2 : 1,
          opacity: 0.9,
          fillOpacity: 0.12,
          fillColor: mainColor,
        });
        attachSelection(circle, camera.id);
        layers.push(circle);
      } else {
        const fov = Math.max(10, Math.min(camera.fov ?? 90, 160));
        const halfFov = fov / 2;
        const range = camera.range;
        const left = destination(camera.lat, camera.lon, range, (camera.azimuth ?? 0) - halfFov);
        const right = destination(camera.lat, camera.lon, range, (camera.azimuth ?? 0) + halfFov);
        const beam = L.polygon([latLng, left, right], {
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

    if (camera.type !== 'panorama') {
      const directionRange = Math.max(20, Math.min(camera.range || 40, 120));
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
  const radius = 6378137; // Terre (m)
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
