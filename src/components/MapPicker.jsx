import React, { useRef, useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// A component that continuously reports the current map bounds
function BoundsReporter({ onBoundsChange }) {
  const map = useMap();
  useEffect(() => {
    const updateBounds = () => {
      const bounds = map.getBounds();
      const center = map.getCenter();
      onBoundsChange({
        s: bounds.getSouth(),
        w: bounds.getWest(),
        n: bounds.getNorth(),
        e: bounds.getEast(),
        centerLat: center.lat,
        centerLon: center.lng,
      });
    };
    
    map.on('moveend', updateBounds);
    updateBounds(); // Initial call
    
    return () => {
      map.off('moveend', updateBounds);
    };
  }, [map, onBoundsChange]);
  
  return null;
}

export default function MapPicker({ onGenerate }) {
  const [bounds, setBounds] = useState(null);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer 
        center={[25.2677, 82.9913]} // Default to BHU roughly
        zoom={16} 
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <BoundsReporter onBoundsChange={setBounds} />
      </MapContainer>

      {/* Floating UI over the map */}
      <div style={{
        position: 'absolute',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(10px)',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        textAlign: 'center',
        width: '320px'
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '16px', color: '#1f2937' }}>Select Area</h2>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#4b5563' }}>
          Pan and zoom to frame the area you want to convert into a 3D diorama.
        </p>
        <button
          onClick={() => onGenerate(bounds)}
          style={{
            width: '100%',
            padding: '12px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
          }}
        >
          Generate 3D Model
        </button>
      </div>
    </div>
  );
}
