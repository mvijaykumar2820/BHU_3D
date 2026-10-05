import React, { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Polygon,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import "leaflet/dist/leaflet.css";
import "leaflet-geosearch/dist/geosearch.css";

// Pre-surveyed zones
const SURVEYED_ZONES = [
  {
    name: "HITEC City, Hyderabad",
    status: "Survey Complete",
    bounds: { s: 17.440, w: 78.370, n: 17.455, e: 78.390 },
    polygon: [
      [17.440, 78.370],
      [17.440, 78.390],
      [17.455, 78.390],
      [17.455, 78.370],
    ],
    dataFile: "hitec_city",
  },
];

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
export default function MapPicker({ onGenerate, onLoadSurveyedZone }) {
  const [isDrag, setIsDrag] = useState(true);
  const [bounds, setBounds] = useState(null);
  const [drawBounds, setDrawBounds] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

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
        
        <button
          style={{
            color: "#ffffff",
            backgroundColor: "rgba(79, 70, 229, 0.95)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(79, 70, 229, 0.4)",
            padding: "0.65rem 0.95rem",
            borderRadius: "999px",
            cursor: "pointer",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            boxShadow: "0 12px 24px rgba(79, 70, 229, 0.25)",
            marginTop: "4px"
          }}
          onClick={() => setShowInfoModal(true)}
        >
          ℹ️ About this Prototype
        </button>
      </div>

      <MapContainer
        center={[17.4475, 78.3800]}
        zoom={15}
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

        {/* Surveyed Zones */}
        {SURVEYED_ZONES.map((zone) => (
          <Polygon
            key={zone.name}
            positions={zone.polygon}
            pathOptions={{
              color: "#16a34a",
              weight: 3,
              fillColor: "#22c55e",
              fillOpacity: 0.15,
              dashArray: "6 4",
            }}
            eventHandlers={{
              click: () => {
                if (onLoadSurveyedZone) {
                  onLoadSurveyedZone(zone);
                }
              },
            }}
          >
            <Tooltip sticky direction="top" opacity={0.95}>
              <div style={{ fontWeight: "bold", fontSize: "13px" }}>
                ✅ {zone.name}
              </div>
              <div style={{ fontSize: "11px", color: "#16a34a" }}>
                {zone.status} — Click to view 3D
              </div>
            </Tooltip>
          </Polygon>
        ))}
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

      {/* Info Modal */}
      {showInfoModal && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 99999,
          backgroundColor: "rgba(0,0,0,0.4)", display: "flex",
          alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)"
        }}>
          <div style={{
            backgroundColor: "#fff", width: "420px", borderRadius: "16px",
            padding: "24px", boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
            display: "flex", flexDirection: "column", gap: "16px"
          }}>
            <h2 style={{ margin: 0, fontSize: "20px", color: "#111827" }}>Bhu-Drishti 3D <span style={{fontSize: "14px", color: "#6b7280"}}>Prototype</span></h2>
            
            <p style={{ margin: 0, fontSize: "14px", color: "#374151", lineHeight: 1.5 }}>
              <strong>What is this?</strong><br/>
              A proof-of-concept 3D Volumetric Property Mapping System. It generates instant 3D dioramas of cities, slices buildings into actionable floor plans, and generates unique 3D-ULPINs for vertical properties.
            </p>
            
            <p style={{ margin: 0, fontSize: "14px", color: "#374151", lineHeight: 1.5 }}>
              <strong>What is the Green Zone (HITEC City)?</strong><br/>
              Green zones are <em>Pre-Surveyed</em> areas. We already have the dense, highly detailed data cached for this zone. Click it for an instant 0-second load time of a massive 3D sector!
            </p>

            <p style={{ margin: 0, fontSize: "14px", color: "#374151", lineHeight: 1.5 }}>
              <strong>How to view outside HITEC City?</strong><br/>
              Click <strong>"Draw Box"</strong> in the top right. Draw a <strong>very small box</strong> (about the size of 1-2 city blocks) over any part of the world map. The system will dynamically pull OpenStreetMap footprints and generate the 3D model on the fly!
            </p>

            <button 
              onClick={() => setShowInfoModal(false)}
              style={{
                marginTop: "8px", padding: "10px", backgroundColor: "#2563eb",
                color: "#fff", border: "none", borderRadius: "8px",
                fontWeight: "bold", cursor: "pointer", fontSize: "14px"
              }}>
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
