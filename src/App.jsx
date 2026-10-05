import { useEffect, useState } from 'react';
import CityDiorama from './components/CityDiorama';
import MapPicker from './components/MapPicker';
import { useAreaStore, useHiddenStore } from './store';

export default function App() {
  const [step, setStep] = useState(0); // 0 = map, 1 = 3D
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const appendAreas = useAreaStore((s) => s.appendAreas);
  const setCenter = useAreaStore((s) => s.setCenter);
  const hiddenIds = useHiddenStore((s) => s.hiddenIds);
  const showAll = useHiddenStore((s) => s.showAll);

  // Overpass mirrors — we rotate between them to avoid rate limits
  const OVERPASS_SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ];

  // Fetch a single area from Overpass, with server fallback
  const fetchArea = async (s, w, n, e, serverIdx = 0) => {
    const server = OVERPASS_SERVERS[serverIdx % OVERPASS_SERVERS.length];
    const query = `[out:json][timeout:60];(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e}););out body geom;`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 65000); // 65s hard timeout

    try {
      setProgress(`Fetching from mirror ${serverIdx + 1}...`);
      const response = await fetch(server, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // Try next server
        if (serverIdx < OVERPASS_SERVERS.length - 1) {
          return fetchArea(s, w, n, e, serverIdx + 1);
        }
        throw new Error(`Overpass rejected the request (HTTP ${response.status}). The area might be too large.`);
      }
      return await response.json();
    } catch (err) {
      if (serverIdx < OVERPASS_SERVERS.length - 1) {
        return fetchArea(s, w, n, e, serverIdx + 1);
      }
      throw err;
    }
  };

  const handleGenerate = async (bounds) => {
    if (!bounds) return;
    
    const { s, w, n, e } = bounds;
    const latSpan = n - s;
    const lonSpan = e - w;
    
    // Check if the area is massively large (VPMS did this too)
    if (latSpan + lonSpan > 0.15) {
      const confirmLarge = window.confirm("The area you selected is very large. The Overpass server might reject it or it may take a long time to load. Do you want to proceed anyway?");
      if (!confirmLarge) return;
    }

    setLoading(true);
    setError('');
    setProgress('');

    try {
      // Set the center for projection (VPMS format: [NE, SW])
      setCenter([
        { lat: n, lng: e },
        { lat: s, lng: w },
      ]);

      // Fetch all buildings in a single request (with mirror fallback)
      const data = await fetchArea(s, w, n, e);
      const allBuildings = data.elements || [];

      // Deduplicate by OSM id just in case
      const seen = new Set();
      const unique = [];
      for (const el of allBuildings) {
        if (!seen.has(el.id)) {
          seen.add(el.id);
          unique.push(el);
        }
      }

      // Convert to VPMS format (lat/lng not lat/lon)
      const blds = unique.map((element) => ({
        id: element.id,
        tags: element.tags,
        geometry: element.geometry
          ? element.geometry.map((pt) => ({ lat: pt.lat, lng: pt.lon }))
          : undefined,
      }));

      setProgress(`✅ Loaded ${blds.length.toLocaleString()} buildings. Rendering 3D...`);
      appendAreas(blds);
      setStep(1);
    } catch (err) {
      console.error(err);
      setError(`Failed: ${err.message}. Try a smaller area or wait a minute.`);
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const handleLoadSurveyedZone = async (zone) => {
    setLoading(true);
    setError('');
    setProgress(`Loading pre-surveyed data for ${zone.name}...`);
    
    try {
      setCenter([
        { lat: zone.bounds.n, lng: zone.bounds.e },
        { lat: zone.bounds.s, lng: zone.bounds.w },
      ]);
      
      const module = await import(`./data/${zone.dataFile}.json`);
      const data = module.default || module;
      
      setProgress(`✅ Loaded ${data.buildings.length.toLocaleString()} buildings. Rendering 3D...`);
      appendAreas(data.buildings);
      setStep(1);
    } catch(err) {
      console.error(err);
      setError(`Failed to load data for ${zone.name}.`);
    } finally {
      setLoading(false);
      setProgress('');
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
                <h2 style={{ color: '#1f2937' }}>{progress || 'Fetching OSM footprints and roads...'}</h2>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            <MapPicker onGenerate={handleGenerate} onLoadSurveyedZone={handleLoadSurveyedZone} />
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
