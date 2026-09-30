import { useState } from 'react';
import CityDiorama from './components/CityDiorama';
import MapPicker from './components/MapPicker';
import { fetchBuildings, fetchRoads } from './utils/osmFetcher';

export default function App() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [dioramaData, setDioramaData] = useState(null);

  const handleGenerate = async (bounds) => {
    if (!bounds) return;

    setLoading(true);
    setDioramaData(null);
    setStatus('⏳ Fetching OSM footprints and road networks...');

    try {
      const { s, w, n, e, centerLat, centerLon } = bounds;

      // 1. Fetch data from Overpass for the exact map bounds
      const [buildings, roads] = await Promise.all([
        fetchBuildings(s, w, n, e),
        fetchRoads(s, w, n, e)
      ]);

      setDioramaData({
        buildings,
        roads,
        originLat: centerLat,
        originLon: centerLon,
      });
      
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus(`❌ Error: ${err.message}. Try zooming in to a smaller area.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#eaecef' }}>
      {/* Header Bar */}
      <header style={{ padding: '15px 25px', background: '#ffffff', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.2rem', color: '#1f2937' }}>
            Bhu-Drishti 3D <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#6b7280' }}>Architectural</span>
          </h1>
        </div>

        {status && !loading && (
          <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '14px', background: '#fef2f2', padding: '6px 12px', borderRadius: '6px', border: '1px solid #fca5a5' }}>
            {status}
          </div>
        )}
        
        {dioramaData && (
          <button 
            onClick={() => setDioramaData(null)}
            style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ← Back to Map
          </button>
        )}
      </header>

      {/* Main Viewport (Either 2D Map or 3D Diorama) */}
      <main style={{ flex: 1, position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '20px', animation: 'spin 2s linear infinite' }}>⏳</div>
            <h2 style={{ color: '#1f2937' }}>{status}</h2>
          </div>
        )}

        {!dioramaData ? (
          <MapPicker onGenerate={handleGenerate} />
        ) : (
          <CityDiorama 
            buildings={dioramaData.buildings} 
            roads={dioramaData.roads} 
            originLat={dioramaData.originLat} 
            originLon={dioramaData.originLon} 
          />
        )}
      </main>
    </div>
  );
}
