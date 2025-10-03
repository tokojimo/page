const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/';
const OSRM_PROFILES = {
  driving: 'driving',
  walking: 'walking',
  cycling: 'cycling',
};

function resolveProfile(mode) {
  if (typeof mode !== 'string') {
    return OSRM_PROFILES.driving;
  }
  const normalized = mode.toLowerCase();
  return OSRM_PROFILES[normalized] || OSRM_PROFILES.driving;
}

function buildRouteUrl(start, end, mode) {
  const startCoords = `${start.lon},${start.lat}`;
  const endCoords = `${end.lon},${end.lat}`;
  const params = new URLSearchParams({ overview: 'full', geometries: 'geojson' });
  const profile = resolveProfile(mode);
  return `${OSRM_BASE_URL}${profile}/${startCoords};${endCoords}?${params.toString()}`;
}

export async function fetchRouteBetween(start, end, mode = 'driving') {
  if (!start || !end) {
    throw new Error('Points de départ et d’arrivée requis.');
  }

  const url = buildRouteUrl(start, end, mode);
  const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!response.ok) {
    throw new Error('Service de calcul d’itinéraire indisponible.');
  }

  const data = await response.json();
  if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error('Aucun itinéraire trouvé pour ces points.');
  }

  const [route] = data.routes;
  const coordinates = Array.isArray(route.geometry?.coordinates)
    ? route.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }))
    : [];

  return {
    coordinates,
    distance: route.distance ?? null,
    duration: route.duration ?? null,
  };
}
