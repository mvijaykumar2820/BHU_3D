import { useState } from 'react';
import CityDiorama from './components/CityDiorama';
import { fetchBuildings, fetchRoads } from './utils/osmFetcher';

export default function App() {
  const [query, setQuery] = useState('Banaras Hindu University');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Enter a location to generate a 3D architectural model.');
  
  const [dioramaData, setDioramaData] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);

  const searchAndGenerate = async (e) => {
    e?.preventDefault();
    if (!query) return;

    setLoading(true);
    setDioramaData(null);
    setSelectedBuilding(null);
    setStatus(`Searching for "${query}"...`);

    try {
      // 1. Geocode via Nominatim
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
      const geoData = await geoRes.json();
      
      if (!geoData || geoData.length === 0) {
        throw new Error('Location not found');
      }

      const place = geoData[0];
      const originLat = parseFloat(place.lat);
      const originLon = parseFloat(place.lon);
      
      // Calculate a ~1km bounding box around the center point
      // 1 deg lat = ~111km. So 0.009 deg is ~1km
      const offsetLat = 0.009;
      const offsetLon = 0.009 / Math.cos(originLat * Math.PI / 180);
      
      const s = originLat - offsetLat;
      const n = originLat + offsetLat;
      const w = originLon - offsetLon;
      const e = originLon + offsetLon;

      setStatus('⏳ Fetching OSM footprints and road networks...');

      // 2. Fetch data from Overpass
      const [buildings, roads] = await Promise.all([
        fetchBuildings(s, w, n, e),
        fetchRoads(s, w, n, e)
      ]);

      setDioramaData({
        buildings,
        roads,
        originLat,
        originLon,
        placeName: place.display_name
      });
      
      setStatus(`✅ Generated 3D model with ${buildings.length.toLocaleString()} buildings.`);
    } catch (err) {
      console.error(err);
      setStatus(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#eaecef' }}>
      {/* Header Bar */}
      <header style={{ padding: '15px 25px', background: '#ffffff', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', zIndex: 10, display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.2rem', color: '#1f2937' }}>Bhu-Drishti 3D <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#6b7280' }}>Architectural</span></h1>
        </div>
        
        <form onSubmit={searchAndGenerate} style={{ display: 'flex', gap: '10px', flex: 1, maxWidth: '500px' }}>
          <input 
            type="text" 
            value={query} 
            onChange={e => setQuery(e.target.value)}
            placeholder="Enter city, neighborhood, or landmark..."
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
          />
          <button 
            type="submit" 
            disabled={loading}
            style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? 'Generating...' : 'Generate 3D'}
          </button>
        </form>

        <div style={{ marginLeft: 'auto', fontSize: '0.9rem', color: '#4b5563' }}>
          {status}
        </div>
      </header>

      {/* Main 3D Viewport */}
      <main style={{ flex: 1, position: 'relative' }}>
        {dioramaData ? (
          <CityDiorama 
            buildings={dioramaData.buildings} 
            roads={dioramaData.roads} 
            originLat={dioramaData.originLat} 
            originLon={dioramaData.originLon} 
            selectedBuildingId={selectedBuilding?.id}
            onSelectBuilding={setSelectedBuilding}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏙️</div>
              <p>Search a location to build the 3D diorama</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
