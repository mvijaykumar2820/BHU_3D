import React, { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Rectangle,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import "leaflet/dist/leaflet.css";
import "leaflet-geosearch/dist/geosearch.css";

// ─── Search Bar ───
function SearchField() {
  const map = useMap();
  useEffect(() => {
    const provider = new OpenStreetMapProvider();
    const searchControl = new GeoSearchControl({
      provider,
      style: 'bar',
      showMarker: false,
      retainZoomLevel: false,
      animateZoom: true,
      autoClose: true,
      searchLabel: 'Enter address, city, or landmark...',
    });
    map.addControl(searchControl);
    return () => map.removeControl(searchControl);
  }, [map]);
  return null;
}

// ─── Rectangle Selector ───
function RectangleSelector({ isDrag, drawBounds, onChange, onDrawChange }) {
  const [firstPoint, setFirstPoint] = useState(null);
  const lastLatlngRef = useRef(null);

  const adjustLng = (latlng) => {
    const adjustedLng = ((((latlng.lng + 180) % 360) + 360) % 360) - 180;
    return new L.LatLng(latlng.lat, adjustedLng);
  };

  const map = useMapEvents({
    mousedown(e) {
      if (!isDrag) {
        setFirstPoint(e.latlng);
        map.dragging.disable();
      }
    },
    mousemove(e) {
      if (firstPoint && !isDrag) {
        lastLatlngRef.current = adjustLng(e.latlng);
        onDrawChange(new L.LatLngBounds(firstPoint, e.latlng));
        onChange(new L.LatLngBounds(adjustLng(firstPoint), adjustLng(e.latlng)));
      }
    },
    mouseup(e) {
      if (firstPoint && !isDrag) {
        onDrawChange(new L.LatLngBounds(firstPoint, e.latlng));
        onChange(new L.LatLngBounds(adjustLng(firstPoint), adjustLng(e.latlng)));
        setFirstPoint(null);
      }
    },
  });

  useEffect(() => {
    if (map) {
      isDrag ? map.dragging.enable() : map.dragging.disable();
    }
  }, [isDrag, map]);

  return drawBounds ? (
    <Rectangle
      bounds={drawBounds}
      pathOptions={{
        color: "rgba(37, 99, 235, 0.95)",
        weight: 2,
        fillColor: "rgba(37, 99, 235, 0.14)",
        fillOpacity: 0.18,
      }}
    />
  ) : null;
}

// ─── Main Map Component ───
export default function MapPicker({ onGenerate }) {
  const [isDrag, setIsDrag] = useState(true);
  const [bounds, setBounds] = useState(null);
  const [drawBounds, setDrawBounds] = useState(null);

  const handleClickSwitchDrag = () => {
    setIsDrag(!isDrag);
  };

  const handleClickRemoveBox = () => {
    setBounds(null);
    setDrawBounds(null);
    setIsDrag(true);
  };

  const handleGenerate = () => {
    if (!bounds) return;
    onGenerate({
      s: bounds.getSouth(),
      w: bounds.getWest(),
      n: bounds.getNorth(),
      e: bounds.getEast(),
      centerLat: bounds.getCenter().lat,
      centerLon: bounds.getCenter().lng,
    });
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      
      {/* Top Right Floating Controls */}
      <div style={{
        position: "absolute",
        zIndex: 9999,
        right: "1rem",
        top: "70px", // Below the search bar
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}>
        <button
          style={{
            display: bounds == null || isDrag ? "none" : "flex",
            color: "#ffffff",
            backgroundColor: "rgba(239, 68, 68, 0.95)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(239, 68, 68, 0.22)",
            padding: "0.65rem 0.95rem",
            borderRadius: "999px",
            cursor: "pointer",
            fontWeight: "bold",
            alignItems: "center",
            boxShadow: "0 12px 24px rgba(239, 68, 68, 0.18)",
          }}
          onClick={handleClickRemoveBox}
        >
          🗑️ Remove Box
        </button>

        <button
          style={{
            color: isDrag ? "#ffffff" : "#111827",
            backgroundColor: isDrag ? "rgba(37, 99, 235, 0.94)" : "rgba(255,255,255,0.92)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${isDrag ? "rgba(37,99,235,0.2)" : "rgba(17,24,39,0.08)"}`,
            padding: "0.65rem 0.95rem",
            borderRadius: "999px",
            cursor: "pointer",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            boxShadow: isDrag ? "0 12px 24px rgba(37, 99, 235, 0.18)" : "0 12px 24px rgba(15, 23, 42, 0.08)",
          }}
          onClick={handleClickSwitchDrag}
        >
          {isDrag ? "⬛ Draw Box" : "✋ Back to Drag"}
        </button>
      </div>

      <MapContainer
        center={[25.2677, 82.9913]}
        zoom={14}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <SearchField />
        <RectangleSelector
          drawBounds={drawBounds}
          isDrag={isDrag}
          onChange={setBounds}
          onDrawChange={setDrawBounds}
        />
      </MapContainer>

      {/* Floating Action Button */}
      {bounds && !isDrag && (
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
          width: '320px',
          animation: 'fadein 0.3s ease-out'
        }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '16px', color: '#1f2937' }}>Area Selected</h2>
          <button
            onClick={handleGenerate}
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
            Generate 3D Diorama
          </button>
        </div>
      )}
    </div>
  );
}
