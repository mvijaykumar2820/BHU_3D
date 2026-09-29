/**
 * Utilities for loading Cesium OSM Buildings (Ion #96188),
 * clipping to a Region of Interest, and querying OpenStreetMap
 * for building counts via the Overpass API.
 */
import * as Cesium from 'cesium';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

let tilesetRef = null;
let highlightedFeature = null;
let originalColor = null;
const HIGHLIGHT = Cesium.Color.YELLOW.withAlpha(0.9);

/* ───── Tileset management ───── */

/**
 * Load the global OSM Buildings 3D tileset and clip it to `rect`.
 * Removes any previously loaded tileset first.
 * @param {Cesium.Viewer} viewer
 * @param {Cesium.Rectangle} rect  — bounding rectangle in radians
 * @returns {Promise<Cesium.Cesium3DTileset>}
 */
export async function loadOsmBuildings(viewer, rect) {
  removeOsmBuildings(viewer);

  const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(96188);
  viewer.scene.primitives.add(tileset);

  // Clip: show only buildings INSIDE the ROI polygon
  const { west, south, east, north } = rect;
  const positions = Cesium.Cartesian3.fromRadiansArray([
    west, south,
    east, south,
    east, north,
    west, north,
  ]);

  tileset.clippingPolygons = new Cesium.ClippingPolygonCollection({
    polygons: [new Cesium.ClippingPolygon({ positions })],
    inverse: true, // clip outside → keep inside
  });

  // Colour by building height
  tileset.style = new Cesium.Cesium3DTileStyle({
    color: {
      conditions: [
        ['${height} > 80', "color('#e74c3c', 0.88)"],   // tall  → red
        ['${height} > 40', "color('#f59e0b', 0.85)"],   // med   → amber
        ['${height} > 15', "color('#22d3ee', 0.85)"],   // norm  → cyan
        ['true',           "color('#81D4FA', 0.75)"],   // small → light blue
      ],
    },
  });

  tilesetRef = tileset;
  return tileset;
}

/** Remove the current OSM Buildings tileset. */
export function removeOsmBuildings(viewer) {
  unhighlightBuilding();
  if (tilesetRef && !tilesetRef.isDestroyed()) {
    viewer.scene.primitives.remove(tilesetRef);
  }
  tilesetRef = null;
}

/** @returns {Cesium.Cesium3DTileset | null} */
export function getOsmTileset() {
  return tilesetRef;
}

/* ───── Overpass building count ───── */

/**
 * Query the Overpass API for the number of buildings within `rect`.
 * Returns the count (integer) or −1 on error.
 */
export async function countBuildingsInArea(rect) {
  const s = Cesium.Math.toDegrees(rect.south);
  const w = Cesium.Math.toDegrees(rect.west);
  const n = Cesium.Math.toDegrees(rect.north);
  const e = Cesium.Math.toDegrees(rect.east);

  const query =
    `[out:json][timeout:30];` +
    `(way["building"](${s},${w},${n},${e});` +
    `relation["building"](${s},${w},${n},${e}););` +
    `out count;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return parseInt(data.elements?.[0]?.tags?.total ?? '0', 10);
  } catch (err) {
    console.warn('Overpass count error:', err);
    return -1;
  }
}

/* ───── Feature picking helpers ───── */

/**
 * Extract human-readable info from a Cesium3DTileFeature.
 */
export function getBuildingInfo(feature) {
  if (!feature) return null;
  const g = (k) => {
    try { return feature.getProperty(k); } catch { return undefined; }
  };

  return {
    name: g('name') || 'Unnamed Building',
    type: prettifyType(g('building') || 'building'),
    height: parseFloat(g('height') || g('render_height') || 0) || null,
    levels: g('building:levels') || null,
    address:
      [g('addr:housenumber'), g('addr:street'), g('addr:city')]
        .filter(Boolean)
        .join(', ') || null,
  };
}

function prettifyType(raw) {
  if (!raw || raw === 'yes') return 'Building';
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ');
}

/** Highlight a feature yellow; restore any previous highlight. */
export function highlightBuilding(feature) {
  unhighlightBuilding();
  if (!(feature instanceof Cesium.Cesium3DTileFeature)) return;
  originalColor = Cesium.Color.clone(feature.color);
  feature.color = HIGHLIGHT;
  highlightedFeature = feature;
}

/** Restore the previously highlighted feature's colour. */
export function unhighlightBuilding() {
  if (highlightedFeature) {
    try {
      highlightedFeature.color = originalColor ?? Cesium.Color.WHITE;
    } catch { /* feature may be destroyed */ }
    highlightedFeature = null;
    originalColor = null;
  }
}
