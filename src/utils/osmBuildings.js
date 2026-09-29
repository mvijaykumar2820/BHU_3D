/**
 * Fetch real building footprints and road networks from OpenStreetMap
 * via the Overpass API, then render them as extruded 3D polygon blocks
 * and green road lines in Cesium — producing a clean "city model" look.
 */
import * as Cesium from 'cesium';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const BUILDING_COLOR = Cesium.Color.fromCssColorString('#c8cdd3').withAlpha(0.95);
const BUILDING_OUTLINE = Cesium.Color.fromCssColorString('#9ca3af').withAlpha(0.5);
const ROAD_COLOR = Cesium.Color.fromCssColorString('#4ade80').withAlpha(0.85);
const HIGHLIGHT = Cesium.Color.YELLOW.withAlpha(0.9);

let buildingDS = null;
let roadDS = null;
let highlightedEntity = null;
let originalMaterial = null;

/* ───── 3D Buildings from OSM footprints ───── */

/**
 * Fetch building footprints from OSM and extrude each one into a 3D block.
 * Returns the number of buildings created.
 */
export async function loadBuildings3D(viewer, rect) {
  removeBuildings3D(viewer);

  const s = Cesium.Math.toDegrees(rect.south);
  const w = Cesium.Math.toDegrees(rect.west);
  const n = Cesium.Math.toDegrees(rect.north);
  const e = Cesium.Math.toDegrees(rect.east);

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

  buildingDS = new Cesium.CustomDataSource('buildings-3d');
  viewer.dataSources.add(buildingDS);

  let count = 0;
  for (const el of data.elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 3) continue;

    // Determine building height from OSM tags
    let height = 10; // default 10 m
    if (el.tags?.height) {
      const parsed = parseFloat(String(el.tags.height));
      if (!isNaN(parsed) && parsed > 0) height = parsed;
    } else if (el.tags?.['building:levels']) {
      const lvl = parseInt(el.tags['building:levels'], 10);
      if (!isNaN(lvl) && lvl > 0) height = lvl * 3;
    }

    const positions = el.geometry.map((pt) =>
      Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat),
    );

    buildingDS.entities.add({
      name: el.tags?.name || 'Building',
      properties: {
        osmId: el.id,
        type: el.tags?.building || 'yes',
        height,
        levels: el.tags?.['building:levels'] || null,
        name: el.tags?.name || null,
        address:
          [el.tags?.['addr:housenumber'], el.tags?.['addr:street'], el.tags?.['addr:city']]
            .filter(Boolean)
            .join(', ') || null,
      },
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        height: 0,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        extrudedHeight: height,
        extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        material: BUILDING_COLOR,
        outline: true,
        outlineColor: BUILDING_OUTLINE,
        closeTop: true,
        closeBottom: true,
      },
    });
    count++;
  }

  return count;
}

export function removeBuildings3D(viewer) {
  unhighlightBuilding();
  if (buildingDS) {
    viewer.dataSources.remove(buildingDS, true);
    buildingDS = null;
  }
}

/* ───── Green road network ───── */

/**
 * Fetch road network from OSM and render as green ground-clamped lines.
 */
export async function loadRoadNetwork(viewer, rect) {
  removeRoadNetwork(viewer);

  const s = Cesium.Math.toDegrees(rect.south);
  const w = Cesium.Math.toDegrees(rect.west);
  const n = Cesium.Math.toDegrees(rect.north);
  const e = Cesium.Math.toDegrees(rect.east);

  const query =
    `[out:json][timeout:60];` +
    `way["highway"](${s},${w},${n},${e});` +
    `out geom;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) return;
    const data = await res.json();

    roadDS = new Cesium.CustomDataSource('roads');
    viewer.dataSources.add(roadDS);

    for (const el of data.elements) {
      if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;

      const positions = el.geometry.map((pt) =>
        Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat),
      );

      const hw = el.tags?.highway || '';
      let width = 1.5;
      if (['primary', 'trunk', 'motorway'].includes(hw)) width = 4;
      else if (['secondary', 'tertiary'].includes(hw)) width = 3;
      else if (['residential', 'living_street', 'unclassified'].includes(hw)) width = 2;

      roadDS.entities.add({
        polyline: {
          positions,
          width,
          material: ROAD_COLOR,
          clampToGround: true,
        },
      });
    }
  } catch (err) {
    console.warn('Road network load error:', err);
  }
}

export function removeRoadNetwork(viewer) {
  if (roadDS) {
    viewer.dataSources.remove(roadDS, true);
    roadDS = null;
  }
}

/* ───── Feature picking ───── */

/**
 * Extract building info from a picked Cesium Entity.
 */
export function getBuildingInfoFromEntity(entity) {
  if (!entity?.properties) return null;

  const get = (key) => {
    try {
      const prop = entity.properties[key];
      if (prop === undefined || prop === null) return undefined;
      if (typeof prop.getValue === 'function') return prop.getValue(Cesium.JulianDate.now());
      return prop;
    } catch {
      return undefined;
    }
  };

  const osmId = get('osmId');
  if (!osmId) return null; // not a building entity

  const rawType = get('type') || 'building';
  return {
    name: get('name') || 'Unnamed Building',
    type: rawType === 'yes' ? 'Building' : rawType.charAt(0).toUpperCase() + rawType.slice(1).replace(/_/g, ' '),
    height: get('height') || null,
    levels: get('levels') || null,
    address: get('address') || null,
    osmId,
  };
}

/** Highlight a building entity yellow. */
export function highlightBuilding(entity) {
  unhighlightBuilding();
  if (!entity?.polygon) return;
  originalMaterial = BUILDING_COLOR;
  entity.polygon.material = HIGHLIGHT;
  highlightedEntity = entity;
}

/** Restore the previous building's colour. */
export function unhighlightBuilding() {
  if (highlightedEntity?.polygon) {
    try {
      highlightedEntity.polygon.material = originalMaterial ?? BUILDING_COLOR;
    } catch { /* entity may be destroyed */ }
  }
  highlightedEntity = null;
  originalMaterial = null;
}
