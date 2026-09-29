import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { clearBuildings, createRoiTool, sizeInMetres } from './tools/roiSlicer';
import PropertyHUD from './components/PropertyHUD';
import BuildingHUD from './components/BuildingHUD';
import SearchBar from './components/SearchBar';
import {
  loadBuildings3D,
  removeBuildings3D,
  loadRoadNetwork,
  removeRoadNetwork,
  getBuildingInfoFromEntity,
  highlightBuilding,
  unhighlightBuilding,
} from './utils/osmBuildings';

// Light base map for clean city-model look
const LIGHT_MAP =
  'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';

// Starting view (India)
const INITIAL_VIEW = [78.9, 22.5, 3_500_000];

export default function App() {
  const containerRef = useRef(null);
  const roiRef = useRef(null);
  const [viewer, setViewer] = useState(null);
  const [selected, setSelected] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [seeThrough, setSeeThrough] = useState(false);
  const [status, setStatus] = useState('Zoom to a site, then draw an ROI box.');

  // 3D city-model state
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
          url: LIGHT_MAP,
          maximumLevel: 19,
          credit: '© CartoDB © OpenStreetMap contributors',
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

    // Clean scene — light sky, no atmosphere haze
    v.scene.skyBox.show = false;
    v.scene.sun.show = false;
    v.scene.moon.show = false;
    v.scene.skyAtmosphere.show = false;
    v.scene.fog.enabled = false;
    v.scene.globe.showGroundAtmosphere = false;
    v.scene.backgroundColor = Cesium.Color.fromCssColorString('#eaecef');

    v.scene.globe.depthTestAgainstTerrain = true;

    // Camera controller
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
      removeBuildings3D(v);
      removeRoadNetwork(v);
      v.destroy();
      setViewer(null);
    };
  }, []);

  // ── Toggle see-through ground ──
  useEffect(() => {
    if (viewer) {
      viewer.scene.globe.translucency.enabled = seeThrough;
      viewer.scene.globe.translucency.frontFaceAlpha = 0.4;
    }
  }, [viewer, seeThrough]);

  // ── Click handler: pick 3D building entities ──
  useEffect(() => {
    if (!viewer) return;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction(({ position }) => {
      const picked = viewer.scene.pick(position);
      if (Cesium.defined(picked) && picked.id instanceof Cesium.Entity) {
        const entity = picked.id;
        const info = getBuildingInfoFromEntity(entity);
        if (info) {
          highlightBuilding(entity);
          setBuildingInfo(info);
          setSelected(null);
          return;
        }
      }
      unhighlightBuilding();
      setBuildingInfo(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => handler.destroy();
  }, [viewer]);

  // ── Handle ROI box completion → build the 3D city model ──
  async function handleRoiComplete(v, rect) {
    if (!v || v.isDestroyed()) return;

    setLoading(true);
    setBuildingInfo(null);
    setBuildingCount(null);
    setSelected(null);
    setStatus('⏳ Fetching building footprints from OpenStreetMap…');

    try {
      // 1. Fetch & extrude buildings
      const count = await loadBuildings3D(v, rect);
      setBuildingCount(count);

      // 2. Fly the camera to a nice 45° view
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

      setStatus(`🏢 ${count} buildings extruded. Loading road network…`);

      // 3. Fetch & render roads (green lines)
      await loadRoadNetwork(v, rect);

      setStatus(`🏢 ${count} buildings · roads loaded. Click a building to inspect.`);
    } catch (err) {
      console.error('3D city model error:', err);
      setStatus('⚠ Failed to load buildings. The area might be too large — try a smaller box.');
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
    removeBuildings3D(viewer);
    removeRoadNetwork(viewer);
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
          <li><i style={{ background: '#c8cdd3' }} />3D Building</li>
          <li><i style={{ background: '#4ade80' }} />Road network</li>
          <li><i style={{ background: '#facc15' }} />Selected</li>
        </ul>
      </aside>

      {/* Floating map navigation controls */}
      <div className="map-controls" role="toolbar" aria-label="Map navigation">
        <button className="ctrl-btn" onClick={zoomIn} title="Zoom In" aria-label="Zoom in">+</button>
        <button className="ctrl-btn" onClick={zoomOut} title="Zoom Out" aria-label="Zoom out">−</button>
        <button className="ctrl-btn" onClick={resetView} title="Reset to Initial View" aria-label="Reset view">⟲</button>
      </div>

      {/* Building info card (clicked 3D building) */}
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
