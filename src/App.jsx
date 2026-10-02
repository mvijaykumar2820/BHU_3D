import { useEffect, useState } from 'react';
import CityDiorama from './components/CityDiorama';
import MapPicker from './components/MapPicker';
import { useAreaStore, useHiddenStore } from './store';

export default function App() {
  const [step, setStep] = useState(0); // 0 = map, 1 = 3D
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const appendAreas = useAreaStore((s) => s.appendAreas);
  const setCenter = useAreaStore((s) => s.setCenter);
  const hiddenIds = useHiddenStore((s) => s.hiddenIds);
  const showAll = useHiddenStore((s) => s.showAll);

  const handleGenerate = async (bounds) => {
    if (!bounds) return;
    setLoading(true);
    setError('');

    try {
      const { s, w, n, e, centerLat, centerLon } = bounds;

      // Set the center for projection (VPMS format: [NE, SW])
      setCenter([
        { lat: n, lng: e },
        { lat: s, lng: w },
      ]);

      // Fetch buildings from Overpass (same query as VPMS — includes relations)
      const query = `[out:json][timeout:25];(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e}););out body geom;`;

      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
      const data = await response.json();

      // Convert to VPMS format (lat/lng not lat/lon)
      const blds = data.elements.map((element) => ({
        id: element.id,
        tags: element.tags,
        geometry: element.geometry
          ? element.geometry.map((pt) => ({ lat: pt.lat, lng: pt.lon }))
          : undefined,
      }));

      appendAreas(blds);
      setStep(1);
    } catch (err) {
      console.error(err);
      setError(`Failed: ${err.message}. Try a smaller area or wait a minute.`);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep(0);
    appendAreas([]);
    setError('');
  };

  const handleExportGLB = () => {
    window.BhuDrishtiExport?.();
  };

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>

      {/* Step 0: Map Selection */}
      {step === 0 && (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <header style={{
            padding: '15px 25px', background: '#ffffff',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <h1 style={{ margin: 0, fontSize: '1.2rem', color: '#1f2937' }}>
              Bhu-Drishti 3D <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#6b7280' }}>Architectural</span>
            </h1>
            {error && (
              <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '14px', background: '#fef2f2', padding: '6px 12px', borderRadius: '6px', border: '1px solid #fca5a5' }}>
                {error}
              </div>
            )}
          </header>

          <div style={{ flex: 1, position: 'relative' }}>
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)',
                zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{ fontSize: '40px', marginBottom: '20px', animation: 'spin 1s linear infinite' }}>⏳</div>
                <h2 style={{ color: '#1f2937' }}>Fetching OSM footprints and roads...</h2>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            <MapPicker onGenerate={handleGenerate} />
          </div>
        </div>
      )}

      {/* Step 1: 3D View (full screen, like VPMS) */}
      {step === 1 && (
        <>
          <CityDiorama />

          {/* Floating controls over the 3D scene */}
          <div style={{
            position: 'fixed', left: '1.5rem', top: '1.5rem', zIndex: 9999,
            display: 'flex', gap: '0.5rem',
          }}>
            <button onClick={handleBack} style={{
              color: '#111827', backgroundColor: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(14px)', border: '1px solid rgba(17,24,39,0.08)',
              padding: '0.65rem 0.95rem', borderRadius: '999px', fontWeight: '700',
              fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
              boxShadow: '0 12px 24px rgba(15, 23, 42, 0.08)',
            }}>
              ← Back to Map
            </button>
          </div>

          {/* Show hidden buildings button */}
          {hiddenIds.size > 0 && (
            <button onClick={showAll} style={{
              position: 'fixed', right: '1.5rem', top: '1.5rem', zIndex: 9999,
              color: '#111827', backgroundColor: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(14px)', border: '1px solid rgba(17,24,39,0.08)',
              padding: '0.65rem 0.95rem', borderRadius: '999px', fontWeight: '700',
              fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
              boxShadow: '0 12px 24px rgba(15, 23, 42, 0.08)',
            }}>
              👁 Reveal hidden ({hiddenIds.size})
            </button>
          )}

          {/* Export GLB button */}
          <div style={{
            position: 'fixed', right: '1.5rem', bottom: '1.5rem', zIndex: 9999,
            display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-end',
          }}>
            <button onClick={handleExportGLB} style={{
              color: '#ffffff', backgroundColor: 'rgba(37, 99, 235, 0.96)',
              backdropFilter: 'blur(14px)', border: '1px solid rgba(37,99,235,0.18)',
              padding: '0.72rem 1rem', borderRadius: '999px', fontWeight: '700',
              fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
              boxShadow: '0 14px 30px rgba(37, 99, 235, 0.22)',
            }}>
              ⬇ Export as GLB
            </button>
          </div>
        </>
      )}
    </div>
  );
}
