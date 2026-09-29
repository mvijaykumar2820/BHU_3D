import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { clearBuildings, createRoiTool } from './tools/roiSlicer';
import PropertyHUD from './components/PropertyHUD';
import SearchBar from './components/SearchBar';

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

  // Task 1: viewer setup
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
    
    // Camera controller configuration:
    // 1. Disable collision detection so translucency / underground features don't lock zoom
    v.scene.screenSpaceCameraController.enableCollisionDetection = false;
    v.scene.screenSpaceCameraController.minimumZoomDistance = 2;
    // 2. Allow Mac trackpad pinch-to-zoom (which sends wheel events with ctrlKey)
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

    // Prevent macOS browser from zooming entire page when pinching on trackpad
    const container = containerRef.current;
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    container?.addEventListener('wheel', handleWheel, { passive: false });

    roiRef.current = createRoiTool(v, { onStatus: setStatus, onDone: () => setDrawing(false) });
    setViewer(v);

    return () => {
      container?.removeEventListener('wheel', handleWheel);
      roiRef.current?.cancel();
      clearBuildings(v);
      v.destroy();
      setViewer(null);
    };
  }, []);

  // See-through ground so basements are visible
  useEffect(() => {
    if (viewer) viewer.scene.globe.translucency.enabled = seeThrough;
  }, [viewer, seeThrough]);

  const toggleDraw = () => {
    if (drawing) {
      roiRef.current.cancel();
      setStatus('ROI cancelled.');
    } else {
      setSelected(null);
      setDrawing(true);
      roiRef.current.start();
    }
  };

  const clearAll = () => {
    setSelected(null);
    clearBuildings(viewer);
    setStatus('Cleared. Draw a new ROI box.');
  };

  const zoomIn = () => {
    if (!viewer) return;
    const height = viewer.camera.positionCartographic.height;
    viewer.camera.zoomIn(Math.max(height * 0.4, 20));
  };

  const zoomOut = () => {
    if (!viewer) return;
    const height = viewer.camera.positionCartographic.height;
    viewer.camera.zoomOut(Math.max(height * 0.4, 20));
  };

  const resetView = () => {
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(...INITIAL_VIEW),
      duration: 1.5,
    });
  };

  const select = useCallback((id) => setSelected(id), []);

  return (
    <div className="app">
      <div ref={containerRef} className="cesium" />

      <SearchBar viewer={viewer} onSelect={select} />

      <aside className="sidebar">
        <h1>Bhu-Drishti 3D</h1>
        <p className="tagline">One ID for every floor.</p>

        <button className={drawing ? 'btn btn-active' : 'btn'} onClick={toggleDraw} disabled={!viewer}>
          {drawing ? 'Cancel drawing' : 'Draw ROI Box'}
        </button>
        <button className="btn btn-quiet" onClick={clearAll} disabled={!viewer}>
          Clear buildings
        </button>

        <label className="check">
          <input type="checkbox" checked={seeThrough} onChange={(e) => setSeeThrough(e.target.checked)} />
          See-through ground
        </label>

        <p className="status" aria-live="polite">{status}</p>

        <ul className="legend">
          <li><i style={{ background: '#f59e0b' }} />Basement</li>
          <li><i style={{ background: '#22d3ee' }} />Above-ground floor</li>
          <li><i style={{ background: '#facc15' }} />Selected</li>
        </ul>
      </aside>

      {/* Floating map navigation controls */}
      <div className="map-controls" role="toolbar" aria-label="Map navigation">
        <button className="ctrl-btn" onClick={zoomIn} title="Zoom In" aria-label="Zoom in">+</button>
        <button className="ctrl-btn" onClick={zoomOut} title="Zoom Out" aria-label="Zoom out">−</button>
        <button className="ctrl-btn" onClick={resetView} title="Reset to Initial View" aria-label="Reset view">⟲</button>
      </div>

      <PropertyHUD viewer={viewer} selected={selected} onSelect={select} />
    </div>
  );
}
