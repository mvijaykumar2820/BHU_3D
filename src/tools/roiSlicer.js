import * as Cesium from 'cesium';
import { generateUlpin, makePniu14 } from '../utils/ulpinGenerator';

const MIN_ROI_M = 8;
const MAX_ROI_M = 2000;
const EARTH_R = 6378137;

/**
 * Demo storey stack. base/top are metres relative to ground.
 * unit = sequential unit index inside the 3D-ULPIN.
 */
const FLOOR_PLAN = [
  { level: -1, vType: 'B', label: 'Basement 1', base: -3, top: 0, unit: 5, owner: 'Society Parking Trust', color: Cesium.Color.ORANGE.withAlpha(0.65) },
  { level: 1, vType: 'A', label: 'Floor 1', base: 0, top: 3, unit: 1, owner: 'Anita Sharma', color: Cesium.Color.CYAN.withAlpha(0.5) },
  { level: 2, vType: 'A', label: 'Floor 2', base: 3, top: 6, unit: 1, owner: 'Rahul Verma', color: Cesium.Color.CYAN.withAlpha(0.5) },
  { level: 3, vType: 'A', label: 'Floor 3', base: 6, top: 9, unit: 1, owner: 'Meera Iyer', color: Cesium.Color.CYAN.withAlpha(0.5) },
];

/** ulpin (18 chars, raw) -> floor record. Entity id === ulpin. */
const floorRegistry = new Map();
export const getFloor = (ulpin) => floorRegistry.get(ulpin);

let drawing = false;
export const isRoiActive = () => drawing;

export function clearBuildings(viewer) {
  for (const id of floorRegistry.keys()) viewer.entities.removeById(id);
  floorRegistry.clear();
}

async function groundHeightAt(viewer, lonRad, latRad) {
  const provider = viewer.terrainProvider;
  if (!provider || provider instanceof Cesium.EllipsoidTerrainProvider) return 0;
  try {
    const [pt] = await Cesium.sampleTerrainMostDetailed(provider, [new Cesium.Cartographic(lonRad, latRad)]);
    return pt?.height ?? 0;
  } catch {
    return 0;
  }
}

function rectFrom(a, b) {
  return new Cesium.Rectangle(
    Math.min(a.longitude, b.longitude),
    Math.min(a.latitude, b.latitude),
    Math.max(a.longitude, b.longitude),
    Math.max(a.latitude, b.latitude),
  );
}

function sizeInMetres(r) {
  const midLat = (r.north + r.south) / 2;
  return {
    w: (r.east - r.west) * Math.cos(midLat) * EARTH_R,
    h: (r.north - r.south) * EARTH_R,
  };
}

/** Extrudes the stacked floor volumes inside `rect`. */
async function buildBuilding(viewer, rect) {
  const { west, south, east, north } = rect;
  const lon = (west + east) / 2;
  const lat = (south + north) / 2;
  const ground = await groundHeightAt(viewer, lon, lat);
  const { w, h } = sizeInMetres(rect);
  const radius = Math.max(15, Math.hypot(w, h) / 2);
  const pniu = makePniu14(Cesium.Math.toDegrees(lon), Cesium.Math.toDegrees(lat));
  const hierarchy = new Cesium.PolygonHierarchy(
    Cesium.Cartesian3.fromRadiansArray([west, south, east, south, east, north, west, north]),
  );

  const built = [];
  for (const f of FLOOR_PLAN) {
    const ulpin = generateUlpin({ pniu, vType: f.vType, level: f.level, unit: f.unit });
    viewer.entities.removeById(ulpin); // redrawing the same spot replaces it

    viewer.entities.add({
      id: ulpin,
      name: f.label,
      polygon: {
        hierarchy,
        height: ground + f.base,
        extrudedHeight: ground + f.top,
        material: f.color,
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        closeTop: true,
        closeBottom: true,
      },
    });

    floorRegistry.set(ulpin, {
      ulpin,
      label: f.label,
      level: f.level,
      vType: f.vType,
      owner: f.owner,
      area: 120, // sq.m, demo value
      encumbrance: 'Verified / No Lien',
      baseColor: f.color,
      radius,
      center: Cesium.Cartesian3.fromRadians(lon, lat, ground + (f.base + f.top) / 2),
    });
    built.push(ulpin);
  }
  return built;
}

/**
 * Two-click bounding-box tool. Right-click cancels.
 * onStatus(text) -> sidebar hint, onDone() -> tool finished or cancelled.
 */
export function createRoiTool(viewer, { onStatus = () => {}, onDone = () => {} } = {}) {
  const scene = viewer.scene;
  let handler = null;
  let corner1 = null;
  let corner2 = null;
  let preview = null;

  const pickGround = (pos) => {
    const ray = viewer.camera.getPickRay(pos);
    const hit = ray && scene.globe.pick(ray, scene);
    return hit ? Cesium.Cartographic.fromCartesian(hit) : undefined;
  };

  const dropPreview = () => {
    if (preview) viewer.entities.remove(preview);
    preview = null;
    corner2 = null;
  };

  const stop = () => {
    handler?.destroy();
    handler = null;
    dropPreview();
    corner1 = null;
    drawing = false;
    scene.canvas.style.cursor = '';
    onDone();
  };

  const onClick = async ({ position }) => {
    const p = pickGround(position);
    if (!p) return;

    if (!corner1) {
      corner1 = p;
      onStatus('Click the opposite corner.');
      return;
    }

    const rect = rectFrom(corner1, p);
    const { w, h } = sizeInMetres(rect);
    dropPreview();

    if (Math.min(w, h) < MIN_ROI_M || Math.max(w, h) > MAX_ROI_M) {
      corner1 = null;
      onStatus(
        Math.max(w, h) > MAX_ROI_M
          ? 'Box is too large. Zoom in and draw a smaller box.'
          : 'Box is too small. Draw a larger box.',
      );
      return;
    }

    handler?.destroy();
    handler = null;
    onStatus('Building floor volumes...');
    const ids = await buildBuilding(viewer, rect);
    stop();
    onStatus(`Created ${ids.length} floor volumes. Click a floor to inspect it.`);
  };

  const onMove = ({ endPosition }) => {
    if (!corner1) return;
    const p = pickGround(endPosition);
    if (!p) return;
    corner2 = p;
    if (!preview) {
      preview = viewer.entities.add({
        rectangle: {
          coordinates: new Cesium.CallbackProperty(() => (corner2 ? rectFrom(corner1, corner2) : undefined), false),
          material: Cesium.Color.WHITE.withAlpha(0.25),
        },
      });
    }
  };

  return {
    start() {
      if (drawing) return;
      drawing = true;
      corner1 = null;
      scene.canvas.style.cursor = 'crosshair';
      onStatus('Click the first corner of the ROI. Right-click to cancel.');
      handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction(onClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction(onMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
      handler.setInputAction(() => {
        stop();
        onStatus('ROI cancelled.');
      }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    },
    cancel() {
      if (drawing) stop();
    },
  };
}
