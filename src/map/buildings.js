const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const QUERY_TIMEOUT = 25;

export async function fetchBuildings(bounds) {
  const area = normalizeBounds(bounds);
  if (!area) {
    return [];
  }

  const query = `
    [out:json][timeout:${QUERY_TIMEOUT}];
    (
      way["building"](${area.south},${area.west},${area.north},${area.east});
      relation["building"](${area.south},${area.west},${area.north},${area.east});
    );
    out body;
    >;
    out skel qt;
  `;

  const response = await fetch(
    `${OVERPASS_ENDPOINT}?data=${encodeURIComponent(query.replace(/\s+/g, ' '))}`
  );

  if (!response.ok) {
    throw new Error(`Requête Overpass échouée (${response.status})`);
  }

  const data = await response.json();
  return parseOverpass(data);
}

function normalizeBounds(bounds) {
  if (!bounds) return null;
  if (typeof bounds.getSouth === 'function') {
    return {
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    };
  }

  const { south, west, north, east } = bounds;
  if ([south, west, north, east].some((value) => !Number.isFinite(value))) {
    return null;
  }
  return { south, west, north, east };
}

function parseOverpass(data) {
  if (!data || !Array.isArray(data.elements)) {
    return [];
  }

  const nodes = new Map();
  const ways = new Map();
  const polygons = [];
  const seen = new Set();

  for (const element of data.elements) {
    if (element.type === 'node' && Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
      nodes.set(element.id, [element.lat, element.lon]);
    }
  }

  for (const element of data.elements) {
    if (element.type !== 'way') continue;
    ways.set(element.id, element);
    if (!isBuilding(element)) continue;

    const polygon = buildPolygonFromWay(element, nodes);
    addPolygon(polygon, polygons, seen);
  }

  for (const element of data.elements) {
    if (element.type !== 'relation' || !isBuilding(element) || !Array.isArray(element.members)) {
      continue;
    }

    const outerWays = element.members.filter((member) => member.type === 'way' && member.role === 'outer');
    for (const member of outerWays) {
      const way = ways.get(member.ref);
      if (!way) continue;
      const polygon = buildPolygonFromWay(way, nodes);
      addPolygon(polygon, polygons, seen);
    }
  }

  return polygons;
}

function isBuilding(element) {
  const tags = element?.tags;
  if (!tags) return false;
  if (tags.building && tags.building !== 'no') return true;
  if (tags['building:part'] && tags['building:part'] !== 'no') return true;
  return false;
}

function buildPolygonFromWay(way, nodes) {
  if (!Array.isArray(way.nodes)) {
    return null;
  }

  const coordinates = [];
  for (const nodeId of way.nodes) {
    const coord = nodes.get(nodeId);
    if (!coord) {
      return null;
    }
    coordinates.push(coord);
  }

  if (coordinates.length < 3) {
    return null;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (!areSameCoordinate(first, last)) {
    coordinates.push(first);
  }

  return coordinates;
}

function addPolygon(polygon, polygons, seen) {
  if (!polygon || polygon.length < 4) {
    return;
  }

  const key = polygon
    .map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`)
    .join('|');
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  polygons.push(polygon);
}

function areSameCoordinate(a, b) {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}
