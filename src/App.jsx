import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { clearBuildings, createRoiTool, sizeInMetres } from './tools/roiSlicer';
import PropertyHUD from './components/PropertyHUD';
import BuildingHUD from './components/BuildingHUD';
import SearchBar from './components/SearchBar';
import {
  loadOsmBuildings,
  removeOsmBuildings,
  countBuildingsInArea,
  getBuildingInfo,
  highlightBuilding,
  unhighlightBuilding,
  getOsmTileset,
} from './utils/osmBuildings';

const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// Starting view (India). Change to your demo site: [lon, lat, height in metres].
const INITIAL_VIEW = [78.9, 22.5, 3_500_000];

export default function App() {
  const containerRef = useRef(null);
  const roiRef = useRef(null);
  const [viewer, setViewer] = useState(null);
  const [selected, setSelected] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [seeThrough, setSeeThrough] = useState(true);
  const [status, setStatus] = useState('Zoom to a site, then draw an ROI box.');

  // OSM Buildings state
  const [buildingCount, setBuildingCount] = useState(null);
  const [buildingInfo, setBuildingInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── Viewer setup ──
  useEffect(() => {
    const token = import.meta.env.VITE_CESIUM_TOKEN;
    if (token) Cesium.Ion.defaultAccessToken = token;

    const v = new Cesium.Viewer(containerRef.current, {
      baseLayer: new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url: ESRI_IMAGERY,
          maximumLevel: 19,
          credit: 'Esri, Maxar, Earthstar Geographics',
        }),
      ),
      terrain: token ? Cesium.Terrain.fromWorldTerrain() : undefined,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    v.scene.globe.depthTestAgainstTerrain = true;
    v.scene.globe.translucency.frontFaceAlpha = 0.6;

    // Camera controller configuration
    v.scene.screenSpaceCameraController.enableCollisionDetection = false;
    v.scene.screenSpaceCameraController.minimumZoomDistance = 2;
    v.scene.screenSpaceCameraController.zoomEventTypes = [
      Cesium.CameraEventType.RIGHT_DRAG,
      Cesium.CameraEventType.WHEEL,
      Cesium.CameraEventType.PINCH,
      {
        eventType: Cesium.CameraEventType.WHEEL,
        modifier: Cesium.KeyboardEventModifier.CTRL,
      },
    ];

    v.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(...INITIAL_VIEW) });

    // Prevent macOS browser page zoom on trackpad pinch
    const container = containerRef.current;
    const handleWheel = (e) => { if (e.ctrlKey) e.preventDefault(); };
    container?.addEventListener('wheel', handleWheel, { passive: false });

    roiRef.current = createRoiTool(v, {
      onStatus: setStatus,
      onDone: () => setDrawing(false),
      onRect: (rect) => handleRoiComplete(v, rect),
    });
    setViewer(v);

    return () => {
      container?.removeEventListener('wheel', handleWheel);
      roiRef.current?.cancel();
      clearBuildings(v);
      removeOsmBuildings(v);
      v.destroy();
      setViewer(null);
    };
  }, []);

  // ── Toggle see-through ground ──
  useEffect(() => {
    if (viewer) viewer.scene.globe.translucency.enabled = seeThrough;
  }, [viewer, seeThrough]);

  // ── 3D Tileset feature picking (LEFT_CLICK) ──
  useEffect(() => {
    if (!viewer) return;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction(({ position }) => {
      const tileset = getOsmTileset();
      if (!tileset) return; // no OSM buildings loaded

      const picked = viewer.scene.pick(position);
      if (picked instanceof Cesium.Cesium3DTileFeature) {
        const info = getBuildingInfo(picked);
        highlightBuilding(picked);
        setBuildingInfo(info);
        setSelected(null); // clear any ULPIN selection
      } else {
        unhighlightBuilding();
        setBuildingInfo(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => handler.destroy();
  }, [viewer]);

  // ── Handle ROI box completion ──
  async function handleRoiComplete(v, rect) {
    if (!v || v.isDestroyed()) return;

    setLoading(true);
    setBuildingInfo(null);
    setBuildingCount(null);
    setSelected(null);
    setStatus('Loading 3D buildings in the selected area…');

    try {
      // 1. Load the Cesium OSM Buildings tileset clipped to the ROI
      await loadOsmBuildings(v, rect);

      // 2. Fly the camera to the selected area at a nice angle
      const center = Cesium.Rectangle.center(rect);
      const { w, h } = sizeInMetres(rect);
      const diagonal = Math.hypot(w, h);
      const altitude = Math.max(diagonal * 1.5, 300);

      v.camera.flyTo({
        destination: Cesium.Cartesian3.fromRadians(center.longitude, center.latitude, altitude),
        orientation: {
          heading: Cesium.Math.toRadians(20),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 2,
      });

      setStatus('3D buildings loaded! Counting buildings via OSM…');

      // 3. Count buildings via Overpass API (runs in parallel with the camera fly)
      const count = await countBuildingsInArea(rect);
      setBuildingCount(count);

      if (count >= 0) {
        setStatus(`🏢 ${count} buildings found in the selected area. Click a building to inspect.`);
      } else {
        setStatus('3D buildings loaded! (Could not reach OSM for count.) Click a building to inspect.');
      }
    } catch (err) {
      console.error('Failed to load OSM Buildings:', err);
      setStatus('⚠ Failed to load 3D buildings. Check your Cesium Ion token.');
    } finally {
      setLoading(false);
    }
  }

  // ── Button handlers ──
  const toggleDraw = () => {
    if (drawing) {
      roiRef.current.cancel();
      setStatus('ROI cancelled.');
    } else {
      setSelected(null);
      setBuildingInfo(null);
      unhighlightBuilding();
      setDrawing(true);
      roiRef.current.start();
    }
  };

  const clearAll = () => {
    setSelected(null);
    setBuildingInfo(null);
    setBuildingCount(null);
    unhighlightBuilding();
    clearBuildings(viewer);
    removeOsmBuildings(viewer);
    setStatus('Cleared. Draw a new ROI box.');
  };

  const zoomIn = () => {
    if (!viewer) return;
    viewer.camera.zoomIn(Math.max(viewer.camera.positionCartographic.height * 0.4, 20));
  };

  const zoomOut = () => {
    if (!viewer) return;
    viewer.camera.zoomOut(Math.max(viewer.camera.positionCartographic.height * 0.4, 20));
  };

  const resetView = () => {
    if (!viewer) return;
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(...INITIAL_VIEW), duration: 1.5 });
  };

  const select = useCallback((id) => setSelected(id), []);

  return (
    <div className="app">
      <div ref={containerRef} className="cesium" />

      <SearchBar viewer={viewer} onSelect={select} />

      <aside className="sidebar">
        <h1>Bhu-Drishti 3D</h1>
        <p className="tagline">One ID for every floor.</p>

        <button className={drawing ? 'btn btn-active' : 'btn'} onClick={toggleDraw} disabled={!viewer || loading}>
          {drawing ? 'Cancel drawing' : loading ? 'Loading…' : 'Draw ROI Box'}
        </button>
        <button className="btn btn-quiet" onClick={clearAll} disabled={!viewer}>
          Clear buildings
        </button>

        <label className="check">
          <input type="checkbox" checked={seeThrough} onChange={(e) => setSeeThrough(e.target.checked)} />
          See-through ground
        </label>

        {/* Building count banner */}
        {buildingCount !== null && buildingCount >= 0 && (
          <div className="building-count" aria-live="polite">
            <span className="count-number">{buildingCount.toLocaleString()}</span>
            <span className="count-label">buildings in area</span>
          </div>
        )}

        <p className="status" aria-live="polite">{status}</p>

        <ul className="legend">
          <li><i style={{ background: '#e74c3c' }} />Tall (&gt;80 m)</li>
          <li><i style={{ background: '#f59e0b' }} />Medium (40–80 m)</li>
          <li><i style={{ background: '#22d3ee' }} />Normal (15–40 m)</li>
          <li><i style={{ background: '#81D4FA' }} />Small (&lt;15 m)</li>
          <li><i style={{ background: '#facc15' }} />Selected</li>
        </ul>
      </aside>

      {/* Floating map navigation controls */}
      <div className="map-controls" role="toolbar" aria-label="Map navigation">
        <button className="ctrl-btn" onClick={zoomIn} title="Zoom In" aria-label="Zoom in">+</button>
        <button className="ctrl-btn" onClick={zoomOut} title="Zoom Out" aria-label="Zoom out">−</button>
        <button className="ctrl-btn" onClick={resetView} title="Reset to Initial View" aria-label="Reset view">⟲</button>
      </div>

      {/* OSM Building info card (when a 3D building is clicked) */}
      <BuildingHUD
        buildingInfo={buildingInfo}
        buildingCount={buildingCount}
        onClose={() => { setBuildingInfo(null); unhighlightBuilding(); }}
      />

      {/* ULPIN floor card (legacy / demo) */}
      <PropertyHUD viewer={viewer} selected={selected} onSelect={select} />
    </div>
  );
}
