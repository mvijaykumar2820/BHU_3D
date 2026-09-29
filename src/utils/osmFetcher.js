const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Fetch buildings within a lat/lon bounding box.
 * Returns raw OSM elements.
 */
export async function fetchBuildings(s, w, n, e) {
  const query =
    `[out:json][timeout:60];` +
    `way["building"](${s},${w},${n},${e});` +
    `out body geom;`;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();
  
  return data.elements.filter(el => el.type === 'way' && el.geometry && el.geometry.length >= 3);
}

/**
 * Fetch roads.
 */
export async function fetchRoads(s, w, n, e) {
  const query =
    `[out:json][timeout:60];` +
    `way["highway"](${s},${w},${n},${e});` +
    `out geom;`;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();
  
  return data.elements.filter(el => el.type === 'way' && el.geometry && el.geometry.length >= 2);
}
